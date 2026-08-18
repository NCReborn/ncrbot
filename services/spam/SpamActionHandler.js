// services/spam/SpamActionHandler.js

const {
  buildSpamAlertEmbed,
  buildFinalActionEmbed
} = require('../../utils/embed');

const modActions = require('../../utils/modActions');
const logger = require('../../utils/logger');
const CONSTANTS = require('../../config/constants');
const spamConfig = require('../../config/spamConfig.json');

class SpamActionHandler {
  constructor(client) {
    this.client = client;
    this.activeAlerts = new Map();
    this.alertLocks = new Map();
  }

  static getInstance(client) {
    if (!SpamActionHandler.instance) {
      SpamActionHandler.instance = new SpamActionHandler(client);
    } else if (client) {
      SpamActionHandler.instance.client = client;
    }
    return SpamActionHandler.instance;
  }

  /**
   * Handle a spam detection event
   */
  async handleDetection(detection, message) {
    const { userId, triggeredRules, confidenceLevel, confidenceScore, evidence } = detection;

    // If alert already exists and is locked, do nothing
    if (this.activeAlerts.has(userId) && this.activeAlerts.get(userId).locked) {
      return;
    }

    // Build embed fields
    const fields = this.buildFields(detection);

    // Build embed using embed.js
    const embed = buildSpamAlertEmbed({
      title: confidenceLevel === 'high'
        ? '🚨 High Confidence Spam Detected'
        : '⚠️ Suspicious Activity — Review Required',
      color: confidenceLevel === 'high' ? 0xFF0000 : 0xFFA500,
      avatar: message.author.displayAvatarURL({ dynamic: true }),
      fields,
      previewImage: evidence[0]?.attachments?.[0]?.url || null
    });

    // Send or update alert
    const alertMessage = await this.sendOrUpdateAlert(userId, embed);

    // Apply automatic action if high confidence
    if (confidenceLevel === 'high') {
      await this.applyAutomaticAction(userId, message, triggeredRules);
      await this.lockAlert(userId, alertMessage, embed, 'Automatic timeout applied');
    }
  }

  /**
   * Build embed fields for the alert
   */
  buildFields(detection) {
    const {
      triggeredRules,
      evidence,
      confidenceScore,
      confidenceLevel,
      activityStats,
      accountCreated,
      joinedServer
    } = detection;

    const fields = [];

    // Triggered rules
    fields.push({
      name: 'Triggered Rules',
      value: triggeredRules
        .map(rule => `• **${rule.name}** — ${rule.description}`)
        .join('\n'),
      inline: false
    });

    // Confidence
    fields.push({
      name: 'Confidence',
      value: `**${confidenceLevel.toUpperCase()}** (score: ${confidenceScore})`,
      inline: true
    });

    // Account info
    fields.push({
      name: 'Account Info',
      value: [
        `Created: <t:${Math.floor(accountCreated / 1000)}:R>`,
        `Joined: <t:${Math.floor(joinedServer / 1000)}:R>`
      ].join('\n'),
      inline: true
    });

    // Activity history
    if (activityStats) {
      fields.push({
        name: 'Server Activity History',
        value: [
          `Messages: ${activityStats.messages}`,
          `Links: ${activityStats.links}`,
          `Media: ${activityStats.media}`,
          `First Message: ${activityStats.firstMessageTimestamp
            ? `<t:${Math.floor(activityStats.firstMessageTimestamp / 1000)}:R>`
            : 'Unknown'}`
        ].join('\n'),
        inline: false
      });
    }

    // Evidence
    const evidenceText = evidence
      .map((ev, i) => {
        const attachCount = ev.attachments?.length || 0;
        return `**Message ${i + 1}** (in <#${ev.channelId}>): ${
          ev.content || '[No text content]'
        }\nAttachments: ${attachCount}`;
      })
      .join('\n\n');

    fields.push({
      name: 'Evidence',
      value: evidenceText || 'No evidence available',
      inline: false
    });

    return fields;
  }

  /**
   * Send or update an alert message
   */
  async sendOrUpdateAlert(userId, embed) {
    const lock = this.alertLocks.get(userId) || Promise.resolve();
    const operation = lock.then(async () => {
      try {
        const alertChannel = await this.client.channels.fetch(spamConfig.alertChannelId);

        // Update existing alert
        if (this.activeAlerts.has(userId)) {
          const alert = this.activeAlerts.get(userId);
          await alert.message.edit({ embeds: [embed] });
          alert.embed = embed;
          logger.info(`[SPAM] Edited existing alert for user ${userId} (message ${alert.message.id})`);
          return alert.message;
        }

        // Create new alert
        const message = await alertChannel.send({ embeds: [embed] });

        this.activeAlerts.set(userId, {
          message,
          embed,
          locked: false
        });
        logger.info(`[SPAM] Created new alert for user ${userId} (message ${message.id})`);

        return message;
      } catch (err) {
        logger.error(`[SPAM] Error sending alert: ${err.message}`);
        return null;
      }
    });

    this.alertLocks.set(userId, operation);
    operation.finally(() => {
      if (this.alertLocks.get(userId) === operation) {
        this.alertLocks.delete(userId);
      }
    });

    return operation;
  }

  /**
   * Apply automatic timeout for high-confidence spam
   */
  async applyAutomaticAction(userId, message, triggeredRules) {
    try {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      const timeoutSeconds = this.getTimeoutSeconds(triggeredRules);

      await modActions.timeoutUser(
        member,
        timeoutSeconds * 1000,
        'Automatic spam timeout (high confidence)'
      );

      logger.info(`[SPAM] Auto-timeout applied to ${member.user.tag}`);
    } catch (err) {
      logger.error(`[SPAM] Error applying automatic action: ${err.message}`);
    }
  }

  /**
   * Determine timeout duration based on triggered rules
   */
  getTimeoutSeconds(triggeredRules) {
    for (const rule of triggeredRules) {
      const cfg = spamConfig.rules[rule.name.replace(/ /g, '')];
      if (cfg?.timeoutSeconds) return cfg.timeoutSeconds;
    }
    return spamConfig.defaultTimeoutSeconds;
  }

  /**
   * Lock alert after moderator or automatic action
   */
  async lockAlert(userId, alertMessage, originalEmbed, actionDescription) {
    try {
      const moderatorTag = 'System';
      const moderatorId = 'N/A';

      const finalEmbed = buildFinalActionEmbed({
        originalEmbed,
        actionDescription,
        moderatorTag,
        moderatorId
      });

      await alertMessage.edit({ embeds: [finalEmbed] });

      const alert = this.activeAlerts.get(userId);
      if (alert) {
        alert.locked = true;
        alert.embed = finalEmbed;
      }
    } catch (err) {
      logger.error(`[SPAM] Error locking alert: ${err.message}`);
    }
  }

  /**
   * Handle moderator button interactions (formerly handleModAction)
   */
  async handleInteraction(interaction) {
    try {
      const userId = interaction.customId.split(':')[1];
      const alert = this.activeAlerts.get(userId);

      if (!alert || alert.locked) {
        return interaction.reply({ content: 'This alert is already resolved.', ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return interaction.reply({ content: 'User no longer in server.', ephemeral: true });
      }

      let actionDescription = '';
      const actionType = interaction.customId.split(':')[0];

      switch (actionType) {
        case 'spam_falsePositive':
          await modActions.removeTimeout(member, 'Marked as false positive');
          actionDescription = 'Marked as false positive — timeout removed';
          break;

        case 'spam_banUser':
          await modActions.banUser(interaction.guild, userId, 'Spam — moderator action');
          actionDescription = 'User banned by moderator';
          break;

        case 'spam_adjustTimeout':
          return interaction.reply({
            content: 'Timeout adjustment is not implemented yet.',
            ephemeral: true
          });

        default:
          return interaction.reply({ content: 'Unknown action.', ephemeral: true });
      }

      // Lock alert
      await this.lockAlert(userId, alert.message, alert.embed, actionDescription);

      await interaction.reply({
        content: `✅ Action applied: ${actionDescription}`,
        ephemeral: true
      });

      logger.info(`[SPAM] Moderator action by ${interaction.user.tag}: ${actionDescription} for user ${userId}`);
    } catch (err) {
      logger.error(`[SPAM] Error handling interaction: ${err.message}`);
      await interaction.reply({
        content: '❌ An error occurred while processing your action.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}

SpamActionHandler.instance = null;

module.exports = SpamActionHandler;
