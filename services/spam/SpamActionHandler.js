const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const spamDetector = require('./SpamDetector');

const CONTENT_PREVIEW_LENGTH = 100;
const MAX_DETECTION_HISTORY = 100;

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
    if (detectionResult.confidenceLevel === 'high') {
      await this.handleHighConfidenceDetection(client, message, member, detectionResult);
    } else {
      await this.handleLowConfidenceDetection(client, message, member, detectionResult);
    }
  }

  async handleHighConfidenceDetection(client, message, member, detectionResult) {
    try {
      logger.info(`[SPAM] High-confidence spam detected for user ${member.user.tag} (${member.user.id})`);

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
      logger.error('[SPAM] Error handling high-confidence spam detection:', error);
    }
  }

  async handleLowConfidenceDetection(client, message, member, detectionResult) {
    try {
      logger.info(`[SPAM] Low-confidence detection for user ${member.user.tag} (${member.user.id}) — review required`);

      const alertChannelId = this.config.alertChannelId;
      if (!alertChannelId) {
        logger.warn('[SPAM] No alert channel configured');
        return;
      }

      const channel = await client.channels.fetch(alertChannelId);
      if (!channel) {
        logger.warn(`[SPAM] Alert channel ${alertChannelId} not found`);
        return;
      }

      const threshold = this.config.confidenceThreshold ?? 3;

      // Build review embed
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Suspicious Activity — Review Required')
        .setColor(0xFFA500)
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

      // Server Activity History
      if (detectionResult.activityStats) {
        const stats = detectionResult.activityStats;
        const firstMessageTime = Math.floor(stats.firstMessageAt / 1000);
        const activityText = [
          `💬 **Messages:** ${stats.messages}`,
          `🔗 **Links:** ${stats.links}`,
          `📷 **Media:** ${stats.media}`,
          `⏱️ **First Message:** <t:${firstMessageTime}:R>`
        ].join('\n');

        embed.addFields([{
          name: '📊 Server Activity History',
          value: activityText,
          inline: false
        }]);
      } else {
        embed.addFields([{
          name: '📊 Server Activity History',
          value: '⚠️ No activity history available',
          inline: false
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
        const evidenceItems = detectionResult.evidence.slice(0, 3);
        const evidenceText = evidenceItems
          .map((ev, idx) => {
            const channelMention = `<#${ev.channelId}>`;
            const content = ev.content ? `"${ev.content}${ev.content.length >= 100 ? '...' : ''}"` : '[No text content]';
            const attachmentLine = ev.attachments && ev.attachments.length > 0
              ? `\n📎 Attachments: ${ev.attachments.map(a => a.name).join(', ')}`
              : '';
            return `**Message ${idx + 1}** (in ${channelMention}): ${content}${attachmentLine}`;
          })
          .join('\n\n');

        embed.addFields([{
          name: 'Evidence',
          value: evidenceText,
          inline: false
        }]);

        // Show first image attachment as a preview
        const firstImageAttachment = evidenceItems
          .flatMap(ev => ev.attachments || [])
          .find(a => a.name && /\.(jpe?g|png|gif|webp)$/i.test(a.name));
        if (firstImageAttachment) {
          embed.setImage(firstImageAttachment.url);
        }
      }

      // No action taken notice
      embed.addFields([
        {
          name: 'Status',
          value: 'ℹ️ **No automatic action taken** — This detection had low confidence. Please review and take action if needed.',
          inline: false
        },
        {
          name: 'Confidence',
          value: `📊 **Confidence:** Low (score: ${detectionResult.confidenceScore}/${threshold})`,
          inline: false
        }
      ]);

      // Review action buttons
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`spam_timeout_${member.user.id}`)
            .setLabel('⏱️ Timeout User')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`spam_ban_${member.user.id}`)
            .setLabel('⛔ Ban User')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`spam_dismiss_${member.user.id}`)
            .setLabel('✅ Dismiss')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`spam_reviewwhitelist_${member.user.id}`)
            .setLabel('🛡️ Whitelist User')
            .setStyle(ButtonStyle.Secondary)
        );

      await channel.send({
        embeds: [embed],
        components: [actionRow]
      });

      logger.info(`[SPAM] Review alert sent to channel ${alertChannelId}`);

      // Record stats
      this.recordDetection(member.user.id, detectionResult);

    } catch (error) {
      logger.error('[SPAM] Error handling low-confidence detection:', error);
    }
  }

  async deleteRecentMessages(guild, userId, detectionResult) {
    const deletedMessages = [];
    const timeWindow = 60 * 1000; // Last 60 seconds
    const now = Date.now();

    try {
      // Get all channels mentioned in evidence
      const channelIds = new Set(detectionResult.evidence.map(e => e.channelId));

      // Also include ALL channels from the detector's tracked activity
      const userActivity = spamDetector.getUserActivity(userId);
      if (userActivity) {
        for (const channelId of userActivity.channels) {
          channelIds.add(channelId);
        }
      }

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
                content: msg.content.substring(0, CONTENT_PREVIEW_LENGTH)
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

      // Server Activity History
      if (detectionResult.activityStats) {
        const stats = detectionResult.activityStats;
        const firstMessageTime = Math.floor(stats.firstMessageAt / 1000);
        const activityText = [
          `💬 **Messages:** ${stats.messages}`,
          `🔗 **Links:** ${stats.links}`,
          `📷 **Media:** ${stats.media}`,
          `⏱️ **First Message:** <t:${firstMessageTime}:R>`
        ].join('\n');

        embed.addFields([{
          name: '📊 Server Activity History',
          value: activityText,
          inline: false
        }]);
      } else {
        // No activity history available (shouldn't happen in normal operation)
        embed.addFields([{
          name: '📊 Server Activity History',
          value: '⚠️ No activity history available',
          inline: false
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
        const evidenceItems = detectionResult.evidence.slice(0, 3);
        const evidenceText = evidenceItems
          .map((ev, idx) => {
            const channelMention = `<#${ev.channelId}>`;
            const content = ev.content ? `"${ev.content}${ev.content.length >= 100 ? '...' : ''}"` : '[No text content]';
            const attachmentLine = ev.attachments && ev.attachments.length > 0
              ? `\n📎 Attachments: ${ev.attachments.map(a => a.name).join(', ')}`
              : '';
            return `**Message ${idx + 1}** (in ${channelMention}): ${content}${attachmentLine}`;
          })
          .join('\n\n');

        embed.addFields([{
          name: 'Evidence',
          value: evidenceText,
          inline: false
        }]);

        // Show first image attachment as a preview
        const firstImageAttachment = evidenceItems
          .flatMap(ev => ev.attachments || [])
          .find(a => a.name && /\.(jpe?g|png|gif|webp)$/i.test(a.name));
        if (firstImageAttachment) {
          embed.setImage(firstImageAttachment.url);
        }
      }

      // Actions taken
      const channelCount = new Set(deletedMessages.map(m => m.channelId)).size;
      const timeoutTimestamp = Math.floor(timeoutUntil.getTime() / 1000);
      const timeoutHours = this.config.defaultTimeoutSeconds / 3600;
      
      const actionsText = [
        `✅ Deleted ${deletedMessages.length} messages across ${channelCount} channel(s)`,
        `✅ Timed out for ${timeoutHours} hours`,
        `✅ Timeout expires <t:${timeoutTimestamp}:R>`
      ].join('\n');

      embed.addFields([
        {
          name: 'Actions Taken',
          value: actionsText,
          inline: false
        },
        {
          name: 'Confidence',
          value: `📊 **Confidence:** High (score: ${detectionResult.confidenceScore ?? 'N/A'})`,
          inline: false
        }
      ]);

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

    // Keep only last MAX_DETECTION_HISTORY detections
    if (this.stats.detections.length > MAX_DETECTION_HISTORY) {
      this.stats.detections = this.stats.detections.slice(-MAX_DETECTION_HISTORY);
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

        // Auto-whitelist the user to prevent future false positives
        try {
          const configPath = path.join(__dirname, '../../config/spamConfig.json');
          const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (!configData.whitelist.users.includes(member.user.id)) {
            configData.whitelist.users.push(member.user.id);
            await fs.promises.writeFile(configPath, JSON.stringify(configData, null, 2));
            spamDetector.reloadConfig();
          }
        } catch (err) {
          logger.error('[SPAM] Failed to auto-whitelist user:', err);
        }

        await interaction.reply({ 
          content: `❌ Timeout removed from ${member.user.tag}. Spam detection marked as false positive. User has been auto-whitelisted.`,
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

      case 'timeout': {
        const timeoutDuration = this.config.defaultTimeoutSeconds * 1000;
        const timeoutUntil = new Date(Date.now() + timeoutDuration);
        const timeoutHours = this.config.defaultTimeoutSeconds / 3600;

        await member.timeout(timeoutDuration, `Manual timeout by ${interaction.user.tag} via review alert`);

        // Delete recent messages
        const emptyDetectionResult = { evidence: [] };
        await this.deleteRecentMessages(interaction.guild, member.user.id, emptyDetectionResult);

        await interaction.reply({
          content: `⏱️ User ${member.user.tag} has been timed out for ${timeoutHours} hours.`,
          ephemeral: true
        });
        logger.info(`[SPAM] Moderator ${interaction.user.tag} manually timed out ${member.user.tag} until ${timeoutUntil.toISOString()}`);
        break;
      }

      case 'dismiss':
        await interaction.reply({
          content: `✅ Alert dismissed by ${interaction.user.tag}. No action taken.`,
          ephemeral: true
        });
        logger.info(`[SPAM] Moderator ${interaction.user.tag} dismissed review alert for ${member.user.tag}`);
        break;

      case 'reviewwhitelist':
        // Add user to whitelist and reload config
        try {
          const configPath = path.join(__dirname, '../../config/spamConfig.json');
          const configData = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
          if (!configData.whitelist.users.includes(member.user.id)) {
            configData.whitelist.users.push(member.user.id);
            await fs.promises.writeFile(configPath, JSON.stringify(configData, null, 2));
            spamDetector.reloadConfig();
          }
        } catch (err) {
          logger.error('[SPAM] Failed to whitelist user:', err);
        }

        await interaction.reply({
          content: `🛡️ ${member.user.tag} has been whitelisted and will no longer be flagged.`,
          ephemeral: true
        });
        logger.info(`[SPAM] Moderator ${interaction.user.tag} whitelisted ${member.user.tag} via review alert`);
        break;
    }
  }
}

module.exports = new SpamActionHandler();
