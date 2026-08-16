// services/spam/SpamActionHandler.js

const {
  buildSpamAlertEmbed,
  buildFinalActionEmbed
} = require('../../utils/embed');

const modActions = require('../modActions');
const logger = require('../../utils/logger');
const CONSTANTS = require('../../config/constants');
const spamConfig = require('../../config/spamConfig.json');

class SpamActionHandler {
  constructor(client) {
    this.client = client;

    // Track active alerts: userId -> { message, embed, locked }
    this.activeAlerts = new Map();
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
    const alertChannel = await this.client.channels.fetch(spamConfig.alertChannelId);

    // Update existing alert
    if (this.activeAlerts.has(userId)) {
      const alert = this.activeAlerts.get(userId);
      await alert.message.edit({ embeds: [embed] });
      alert.embed = embed;
      return alert.message;
    }

    // Create new alert
    const message = await alertChannel.send({ embeds: [embed] });

    this.activeAlerts.set(userId, {
      message,
      embed,
      locked: false
    });

    return message;
  }

  /**
   * Apply automatic timeout for high-confidence spam
   */
  async applyAutomaticAction(userId, message, triggeredRules) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const timeoutSeconds = this.getTimeoutSeconds(triggeredRules);

    await modActions.timeoutUser(
      member,
      timeoutSeconds * 1000,
      'Automatic spam timeout (high confidence)'
    );

    logger.info(`[SPAM] Auto-timeout applied to ${member.user.tag}`);
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
  }

  /**
   * Handle moderator button interactions
   */
  async handleInteraction(interaction) {
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

    switch (interaction.customId.split(':')[0]) {
      case 'falsePositive':
        await modActions.removeTimeout(member, 'Marked as false positive');
        actionDescription = 'Marked as false positive — timeout removed';
        break;

      case 'banUser':
        await modActions.banUser(interaction.guild, userId, 'Spam — moderator action');
        actionDescription = 'User banned by moderator';
        break;

      case 'adjustTimeout':
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
      content: `Action applied: ${actionDescription}`,
      ephemeral: true
    });
  }
}

module.exports = SpamActionHandler;
