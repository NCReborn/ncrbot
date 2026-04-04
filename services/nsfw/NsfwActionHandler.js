const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../utils/logger');
const nsfwDetector = require('./NsfwDetector');

const fs = require('fs');
const path = require('path');

class NsfwActionHandler {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/nsfwConfig.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('[NSFW] Failed to load config in NsfwActionHandler:', error);
      return { alertChannelId: null };
    }
  }

  /**
   * Format prediction scores for embed display.
   */
  formatPredictions(predictions) {
    return predictions
      .sort((a, b) => b.probability - a.probability)
      .map((p) => {
        const bar = this._progressBar(p.probability);
        const pct = (p.probability * 100).toFixed(1);
        return `**${p.className}**: ${bar} ${pct}%`;
      })
      .join('\n');
  }

  _progressBar(value) {
    const filled = Math.round(value * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  /**
   * Build the shared embed for both high and medium alerts.
   */
  _buildEmbed(message, predictions, confidenceLevel) {
    const isHigh = confidenceLevel === 'high';
    const color = isHigh ? 0xFF0000 : 0xFFA500;
    const title = isHigh
      ? '🚨 High Confidence NSFW Detected'
      : '⚠️ Medium Confidence NSFW Content';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setTimestamp()
      .addFields(
        { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
        { name: 'Message', value: `[Jump to message](${message.url})`, inline: true },
        { name: 'NSFW Scores', value: this.formatPredictions(predictions), inline: false }
      );

    if (isHigh) {
      embed.addFields({
        name: 'Status',
        value: '⚠️ **Logging only** — no automatic action taken. Use the buttons below to act.',
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'Status',
        value: 'ℹ️ **Uncertain confidence** — review required. No automatic action taken.',
        inline: false,
      });
    }

    return embed;
  }

  /**
   * Handle high-confidence detection: log to bot-alerts, no auto-delete.
   */
  async handleHighConfidence(client, message, predictions, imageUrl, imageHash) {
    const alertChannelId = this.config.alertChannelId;
    if (!alertChannelId) {
      logger.warn('[NSFW] No alert channel configured');
      return;
    }

    try {
      const alertChannel = await client.channels.fetch(alertChannelId);
      if (!alertChannel) {
        logger.warn(`[NSFW] Alert channel ${alertChannelId} not found`);
        return;
      }

      const embed = this._buildEmbed(message, predictions, 'high');

      // Attach the image so mods can see it
      if (imageUrl) {
        embed.setImage(imageUrl);
      }

      const deleteId = `nsfw_delete_${message.channelId}_${message.id}`;
      // Use the full MD5 hash to avoid collision risk in the whitelist
      const fpId = `nsfw_fp_${imageHash}`;

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(deleteId)
          .setLabel('🗑️ Delete Message')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(fpId)
          .setLabel('❌ False Positive')
          .setStyle(ButtonStyle.Secondary)
      );

      await alertChannel.send({ embeds: [embed], components: [actionRow] });

      logger.info(
        `[NSFW] High-confidence alert sent for message ${message.id} by ${message.author.tag} in #${message.channel.name}`
      );
    } catch (error) {
      logger.error('[NSFW] Error sending high-confidence alert:', error);
    }
  }

  /**
   * Handle medium-confidence detection: log to bot-alerts, no auto-delete.
   */
  async handleMediumConfidence(client, message, predictions, imageUrl, imageHash) {
    const alertChannelId = this.config.alertChannelId;
    if (!alertChannelId) {
      logger.warn('[NSFW] No alert channel configured');
      return;
    }

    try {
      const alertChannel = await client.channels.fetch(alertChannelId);
      if (!alertChannel) {
        logger.warn(`[NSFW] Alert channel ${alertChannelId} not found`);
        return;
      }

      const embed = this._buildEmbed(message, predictions, 'medium');

      if (imageUrl) {
        embed.setImage(imageUrl);
      }

      const deleteId = `nsfw_delete_${message.channelId}_${message.id}`;
      // Use the full MD5 hash to avoid collision risk in the whitelist
      const fpId = `nsfw_fp_${imageHash}`;

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(deleteId)
          .setLabel('🗑️ Delete Message')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(fpId)
          .setLabel('❌ False Positive')
          .setStyle(ButtonStyle.Success)
      );

      await alertChannel.send({ embeds: [embed], components: [actionRow] });

      logger.info(
        `[NSFW] Medium-confidence alert sent for message ${message.id} by ${message.author.tag} in #${message.channel.name}`
      );
    } catch (error) {
      logger.error('[NSFW] Error sending medium-confidence alert:', error);
    }
  }

  /**
   * Handle mod button interactions for NSFW alerts.
   * customId formats:
   *   nsfw_delete_<channelId>_<messageId>
   *   nsfw_fp_<hash16>
   */
  async handleModAction(interaction, client) {
    const parts = interaction.customId.split('_');
    // parts[0] = 'nsfw', parts[1] = action type
    const actionType = parts[1];

    try {
      if (actionType === 'delete') {
        // nsfw_delete_<channelId>_<messageId>
        const channelId = parts[2];
        const messageId = parts[3];

        try {
          const targetChannel = await client.channels.fetch(channelId);
          const targetMessage = await targetChannel.messages.fetch(messageId);
          await targetMessage.delete();

          await interaction.reply({
            content: `🗑️ Message deleted by ${interaction.user.tag}.`,
            ephemeral: true,
          });

          logger.info(
            `[NSFW] Moderator ${interaction.user.tag} manually deleted message ${messageId} from channel ${channelId}`
          );
        } catch (err) {
          if (err.code === 10008) {
            // Unknown Message — already deleted
            await interaction.reply({
              content: '⚠️ Message was already deleted.',
              ephemeral: true,
            });
          } else {
            throw err;
          }
        }
      } else if (actionType === 'fp') {
        // nsfw_fp_<hash16>
        const hash = parts[2];
        nsfwDetector.addToWhitelist(hash);

        await interaction.reply({
          content: `✅ Image added to whitelist by ${interaction.user.tag}. This image will be ignored in future scans.`,
          ephemeral: true,
        });

        logger.info(
          `[NSFW] Moderator ${interaction.user.tag} whitelisted image hash ${hash}`
        );
      } else {
        await interaction.reply({
          content: 'Unknown NSFW action.',
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('[NSFW] Error handling mod button action:', error);
      const msg = { content: 'An error occurred while processing this action.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  }
}

module.exports = new NsfwActionHandler();
