const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class SpamActionHandler {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/spamConfig.json');
    this.statsPath = path.join(__dirname, '../../data/spamStats.json');
    this.config = this.loadConfig();
    this.stats = this.loadStats();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load spam config:', error);
      return { alertChannelId: null, defaultTimeoutSeconds: 43200 };
    }
  }

  loadStats() {
    try {
      if (fs.existsSync(this.statsPath)) {
        const data = fs.readFileSync(this.statsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load spam stats:', error);
    }
    return { totalDetections: 0, detections: [] };
  }

  saveStats() {
    try {
      fs.writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      logger.error('Failed to save spam stats:', error);
    }
  }

  async handleSpamDetection(client, message, member, detectionResult) {
    try {
      logger.info(`[SPAM] Spam detected for user ${member.user.tag} (${member.user.id})`);

      // 1. Delete recent spam messages
      const deletedMessages = await this.deleteRecentMessages(message.guild, member.user.id, detectionResult);

      // 2. Timeout the user
      const timeoutDuration = this.config.defaultTimeoutSeconds * 1000;
      const timeoutUntil = new Date(Date.now() + timeoutDuration);
      
      await member.timeout(timeoutDuration, 'Spam detection: ' + detectionResult.triggeredRules.map(r => r.name).join(', '));
      
      logger.info(`[SPAM] User ${member.user.tag} timed out until ${timeoutUntil.toISOString()}`);

      // 3. Create and send mod alert
      await this.sendModAlert(client, member, detectionResult, deletedMessages, timeoutUntil);

      // 4. Record stats
      this.recordDetection(member.user.id, detectionResult);

    } catch (error) {
      logger.error('[SPAM] Error handling spam detection:', error);
    }
  }

  async deleteRecentMessages(guild, userId, detectionResult) {
    const deletedMessages = [];
    const timeWindow = 60 * 1000; // Last 60 seconds
    const now = Date.now();

    try {
      // Get all channels mentioned in evidence
      const channelIds = new Set(detectionResult.evidence.map(e => e.channelId));

      for (const channelId of channelIds) {
        try {
          const channel = await guild.channels.fetch(channelId);
          if (!channel || !channel.isTextBased()) continue;

          // Fetch recent messages
          const messages = await channel.messages.fetch({ limit: 50 });
          
          // Filter messages from this user in the time window
          const userMessages = messages.filter(msg => 
            msg.author.id === userId && 
            now - msg.createdTimestamp < timeWindow
          );

          // Delete them
          for (const msg of userMessages.values()) {
            try {
              await msg.delete();
              deletedMessages.push({
                id: msg.id,
                channelId: msg.channelId,
                content: msg.content.substring(0, 100)
              });
            } catch (err) {
              logger.error(`[SPAM] Failed to delete message ${msg.id}:`, err);
            }
          }
        } catch (err) {
          logger.error(`[SPAM] Failed to process channel ${channelId}:`, err);
        }
      }

      logger.info(`[SPAM] Deleted ${deletedMessages.length} messages from user ${userId}`);
    } catch (error) {
      logger.error('[SPAM] Error deleting messages:', error);
    }

    return deletedMessages;
  }

  async sendModAlert(client, member, detectionResult, deletedMessages, timeoutUntil) {
    const alertChannelId = this.config.alertChannelId;
    if (!alertChannelId) {
      logger.warn('[SPAM] No alert channel configured');
      return;
    }

    try {
      const channel = await client.channels.fetch(alertChannelId);
      if (!channel) {
        logger.warn(`[SPAM] Alert channel ${alertChannelId} not found`);
        return;
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle('🚨 Spam Detected & Actioned')
        .setColor(0xFF0000)
        .setTimestamp()
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }));

      // User info
      embed.addFields([
        { 
          name: 'User', 
          value: `${member.user.tag} (${member.user.id})`,
          inline: true 
        },
        { 
          name: 'Account Created', 
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          inline: true 
        }
      ]);

      if (member.joinedTimestamp) {
        embed.addFields([{
          name: 'Joined Server',
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
          inline: true
        }]);
      }

      // Triggered rules
      const rulesText = detectionResult.triggeredRules
        .map(rule => {
          const emoji = rule.severity === 'critical' ? '❌' : 
                       rule.severity === 'high' ? '⚠️' : 
                       rule.severity === 'warning' ? '⚠️' : '•';
          return `${emoji} **${rule.name}**: ${rule.description}`;
        })
        .join('\n');

      embed.addFields([{
        name: 'Triggered Rules',
        value: rulesText,
        inline: false
      }]);

      // Evidence
      if (detectionResult.evidence.length > 0) {
        const evidenceText = detectionResult.evidence
          .slice(0, 3)
          .map((ev, idx) => {
            const channelMention = `<#${ev.channelId}>`;
            const content = ev.content ? `"${ev.content}${ev.content.length >= 100 ? '...' : ''}"` : '[No text content]';
            return `**Message ${idx + 1}** (in ${channelMention}): ${content}`;
          })
          .join('\n\n');

        embed.addFields([{
          name: 'Evidence',
          value: evidenceText,
          inline: false
        }]);
      }

      // Actions taken
      const channelCount = new Set(deletedMessages.map(m => m.channelId)).size;
      const timeoutTimestamp = Math.floor(timeoutUntil.getTime() / 1000);
      
      const actionsText = [
        `✅ Deleted ${deletedMessages.length} messages across ${channelCount} channel(s)`,
        `✅ Timed out for 12 hours`,
        `✅ Timeout expires <t:${timeoutTimestamp}:R>`
      ].join('\n');

      embed.addFields([{
        name: 'Actions Taken',
        value: actionsText,
        inline: false
      }]);

      // Create action buttons
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`spam_confirm_${member.user.id}`)
            .setLabel('✅ Confirmed Spam')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`spam_false_${member.user.id}`)
            .setLabel('❌ False Positive')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`spam_ban_${member.user.id}`)
            .setLabel('⛔ Ban User')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`spam_adjust_${member.user.id}`)
            .setLabel('⏱️ Adjust Timeout')
            .setStyle(ButtonStyle.Secondary)
        );

      await channel.send({ 
        embeds: [embed],
        components: [actionRow]
      });

      logger.info(`[SPAM] Alert sent to channel ${alertChannelId}`);
    } catch (error) {
      logger.error('[SPAM] Error sending mod alert:', error);
    }
  }

  recordDetection(userId, detectionResult) {
    this.stats.totalDetections++;
    this.stats.detections.push({
      userId,
      timestamp: Date.now(),
      rules: detectionResult.triggeredRules.map(r => r.name),
      evidenceCount: detectionResult.evidence.length
    });

    // Keep only last 100 detections
    if (this.stats.detections.length > 100) {
      this.stats.detections = this.stats.detections.slice(-100);
    }

    this.saveStats();
  }

  // Handler for mod action buttons
  async handleModAction(interaction) {
    const [action, , userId] = interaction.customId.split('_');
    
    try {
      switch (action) {
        case 'spam':
          await this.handleSpamAction(interaction, userId);
          break;
      }
    } catch (error) {
      logger.error('[SPAM] Error handling mod action:', error);
      await interaction.reply({ 
        content: 'An error occurred while processing this action.', 
        ephemeral: true 
      });
    }
  }

  async handleSpamAction(interaction, userId) {
    const actionType = interaction.customId.split('_')[1];
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      await interaction.reply({ 
        content: 'User is no longer in the server.', 
        ephemeral: true 
      });
      return;
    }

    switch (actionType) {
      case 'confirm':
        await interaction.reply({ 
          content: `✅ Spam detection confirmed for ${member.user.tag}. Action logged.`,
          ephemeral: true 
        });
        logger.info(`[SPAM] Moderator ${interaction.user.tag} confirmed spam for ${member.user.tag}`);
        break;

      case 'false':
        // Remove timeout
        await member.timeout(null, `False positive - cleared by ${interaction.user.tag}`);
        await interaction.reply({ 
          content: `❌ Timeout removed from ${member.user.tag}. Spam detection marked as false positive.`,
          ephemeral: true 
        });
        logger.info(`[SPAM] Moderator ${interaction.user.tag} marked detection as false positive for ${member.user.tag}`);
        break;

      case 'ban':
        await interaction.reply({ 
          content: `⛔ To ban ${member.user.tag}, please use Discord's native ban command or right-click > Ban.`,
          ephemeral: true 
        });
        break;

      case 'adjust':
        await interaction.reply({ 
          content: `⏱️ To adjust timeout for ${member.user.tag}, use the /timeout command or right-click > Timeout.`,
          ephemeral: true 
        });
        break;
    }
  }
}

module.exports = new SpamActionHandler();
