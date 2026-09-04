// services/spam/SpamActionHandler.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  buildSpamAlertEmbed,
  buildPendingReviewEmbed,
  buildFinalActionEmbed
} = require('../../utils/embed');

const modActions = require('../../utils/modActions');
const logger = require('../../utils/logger');

// IMPORTANT: use live config from SpamDetector (auto‑reloads)
const spamDetector = require('./SpamDetector');

/** Emoji severity icons for triggered rule lines */
const SEVERITY_ICON = { critical: '🔴', high: '⚠️', warning: '🟡' };

async function withTimeout(promise, timeoutMs, operationLabel = 'operation') {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${operationLabel} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper function for safe member fetch with timeout
async function fetchMemberSafe(guild, userId, timeoutMs = 2000) {
  try {
    let timeoutId;
    let timedOut = false;

    const fetchPromise = guild.members.fetch(userId).catch(() => null);
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, timeoutMs);
    });

    const result = await Promise.race([fetchPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    
    if (timedOut) {
      logger.warn(`[SPAM] Member fetch timed out for user ${userId} in guild ${guild.id}`);
      return null;
    }

    return result;
  } catch (err) {
    logger.warn(`[SPAM] Member fetch error for user ${userId}: ${err.message}`);
    return null;
  }
}

/**
 * Returns the set of protected channel IDs for a guild.
 * Uses live config from spamDetector.config.
 */
function getProtectedChannelIds(guildId) {
  const cfg = spamDetector.config;
  const guildCfg = cfg.guilds?.[guildId];
  const protected_ = guildCfg?.protectedChannels || cfg.protectedChannels || {};
  return new Set(Object.values(protected_));
}

/**
 * Resolve alert channel ID for a given guild.
 * Uses live config from spamDetector.config.
 */
function getAlertChannelId(guildId) {
  const cfg = spamDetector.config;
  const guildCfg = cfg.guilds?.[guildId];
  return guildCfg?.alertChannelId || cfg.alertChannelId;
}

/**
 * Build composite key for per-guild per-user alert state.
 */
function buildAlertKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

class SpamActionHandler {
  constructor(client) {
    this.client = client;

    // Per-guild per-user alert state
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

  buildActionRow(userId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`spam_confirm:${userId}`)
        .setLabel('✅ Confirmed Spam')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`spam_falsePositive:${userId}`)
        .setLabel('❌ False Positive')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`spam_banUser:${userId}`)
        .setLabel('🔨 Ban User')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`spam_adjustTimeout:${userId}`)
        .setLabel('🔧 Adjust Timeout')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  async handleDetection(detection, message) {
    const { userId, triggeredRules, confidenceLevel, evidence, guildId } = detection;

    const alertKey = buildAlertKey(guildId, userId);

    const existingAlert = this.activeAlerts.get(alertKey);
    if (existingAlert && existingAlert.locked) {
      return;
    }

    const fields = this.buildFields(detection, []);
    const embed = buildSpamAlertEmbed({
      title: confidenceLevel === 'high'
        ? '🚨 Spam Detected & Actioned'
        : '⚠️ Suspicious Activity — Review Required',
      color: confidenceLevel === 'high' ? 0xFF0000 : 0xFFA500,
      avatar: message.author.displayAvatarURL({ dynamic: true }),
      fields
    });

    const alertMessage = await this.sendOrUpdateAlert(userId, embed, guildId);

    if (confidenceLevel === 'high') {
      const actionsTaken = await this.applyAutomaticAction(
        userId,
        message,
        triggeredRules,
        evidence,
        guildId
      );

      const updatedFields = this.buildFields(detection, actionsTaken);
      const updatedEmbed = buildSpamAlertEmbed({
        title: '🚨 Spam Detected & Actioned',
        color: 0xFF0000,
        avatar: message.author.displayAvatarURL({ dynamic: true }),
        fields: updatedFields
      });

      if (alertMessage) {
        await this.markPendingReview(userId, alertMessage, updatedEmbed, guildId);
      } else {
        logger.warn(
          `[SPAM] Auto-action completed for user ${userId} in guild ${guildId}, but alert message was unavailable`
        );
      }
    }
  }

  buildFields(detection, actionsTaken = []) {
    const {
      triggeredRules,
      evidence,
      confidenceScore,
      confidenceLevel,
      activityStats,
      accountCreated,
      joinedServer,
      userId,
      userTag
    } = detection;

    const fields = [];

    fields.push({
      name: 'User',
      value: `${userTag || 'Unknown'}\n(${userId})`,
      inline: true
    });
    fields.push({
      name: 'Account Created',
      value: `<t:${Math.floor(accountCreated / 1000)}:R>`,
      inline: true
    });
    fields.push({
      name: 'Joined Server',
      value: `<t:${Math.floor(joinedServer / 1000)}:R>`,
      inline: true
    });

    if (activityStats) {
      fields.push({
        name: '📊 Server Activity History',
        value: [
          `💬 **Messages:** ${activityStats.messages}`,
          `🔗 **Links:** ${activityStats.links}`,
          `🖼️ **Media:** ${activityStats.media}`,
          `🕐 **First Message:** ${
            activityStats.firstMessageTimestamp
              ? `<t:${Math.floor(activityStats.firstMessageTimestamp / 1000)}:R>`
              : 'Unknown'
          }`
        ].join('\n'),
        inline: false
      });
    }

    fields.push({
      name: 'Triggered Rules',
      value: triggeredRules
        .map(rule => {
          const icon = SEVERITY_ICON[rule.severity] || '🔹';
          return `${icon} **${rule.name}**: ${rule.description}`;
        })
        .join('\n'),
      inline: false
    });

    const evidenceText = evidence
      .map((ev, i) => {
        const channelDisplay = ev.channelId
          ? `<#${ev.channelId}>`
          : 'Unknown Channel';
        const attachmentNames = (ev.attachments || [])
          .map(a => a.name || 'attachment')
          .join(', ');
        const attachLine = attachmentNames
          ? `🖇️ Attachments: ${attachmentNames}`
          : null;
        const lines = [
          `**Message ${i + 1}** (in ${channelDisplay}): ${ev.content || '[No text content]'}`
        ];
        if (attachLine) lines.push(attachLine);
        return lines.join('\n');
      })
      .join('\n\n');

    fields.push({
      name: 'Evidence',
      value: evidenceText || 'No evidence available',
      inline: false
    });

    if (actionsTaken.length > 0) {
      fields.push({
        name: 'Actions Taken',
        value: actionsTaken.map(a => `✅ ${a}`).join('\n'),
        inline: false
      });
    }

    fields.push({
      name: 'Confidence',
      value: `📊 **Confidence:** ${confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1)} (score: ${confidenceScore})`,
      inline: false
    });

    return fields;
  }

async sendOrUpdateAlert(userId, embed, guildId) {
  const alertKey = buildAlertKey(guildId, userId);
  const lock = this.alertLocks.get(alertKey) || Promise.resolve();

  const operation = lock
    .catch((err) => {
      logger.error(`[SPAM] Previous alert operation failed for ${alertKey}: ${err.message}`);
      return null;
    })
    .then(async () => {
      try {
        return await withTimeout(
          (async () => {
            const alertChannelId = getAlertChannelId(guildId);
            if (!alertChannelId) {
              logger.error(`[SPAM] No alertChannelId configured for guild ${guildId}`);
              return null;
            }

            const alertChannel = await this.client.channels.fetch(alertChannelId);
            const components = [this.buildActionRow(userId)];

            const existingAlert = this.activeAlerts.get(alertKey);
            if (existingAlert) {
              if (existingAlert.locked) return existingAlert.message;
              await existingAlert.message.edit({ embeds: [embed], components });
              existingAlert.embed = embed;
              logger.info(
                `[SPAM] Edited existing alert for user ${userId} in guild ${guildId} (message ${existingAlert.message.id})`
              );
              return existingAlert.message;
            }

            const message = await alertChannel.send({ embeds: [embed], components });

            this.activeAlerts.set(alertKey, {
              message,
              embed,
              locked: false
            });

            logger.info(
              `[SPAM] Created new alert for user ${userId} in guild ${guildId} (message ${message.id})`
            );

            return message;
          })(),
          5000,
          `sendOrUpdateAlert(${alertKey})`
        );
      } catch (err) {
        logger.error(`[SPAM] Error sending alert in guild ${guildId}: ${err.message}`);
        return null;
      }
    });

  this.alertLocks.set(alertKey, operation);

  operation.finally(() => {
    if (this.alertLocks.get(alertKey) === operation) {
      this.alertLocks.delete(alertKey);
    }
  });

  return operation;
}
  async applyAutomaticAction(userId, message, triggeredRules, evidence, guildId) {
    const actionsTaken = [];

    const protectedIds = getProtectedChannelIds(guildId);
    const hasUnprotectedEvidence = (evidence || []).some(
      ev => ev.channelId && !protectedIds.has(ev.channelId)
    );

    if (!hasUnprotectedEvidence) {
      logger.info(
        `[SPAM] Suppressed auto-action for user ${userId} in guild ${guildId} — all evidence is from protected channels`
      );
      actionsTaken.push('Auto-action suppressed: all triggering messages are from protected channels (pending staff review)');
      return actionsTaken;
    }

    try {
      const member = await fetchMemberSafe(message.guild, userId, 2000);
      if (member) {
        const timeoutSeconds = this.getTimeoutSeconds(triggeredRules);
        const hours = timeoutSeconds / 3600;
        const timeoutApplied = await modActions.timeoutUser(
          member,
          timeoutSeconds * 1000,
          'Automatic spam timeout (high confidence)'
        );
        if (timeoutApplied) {
          const timeoutExpiry = Math.floor((Date.now() + timeoutSeconds * 1000) / 1000);
          actionsTaken.push(`Timed out for ${hours} hour${hours !== 1 ? 's' : ''}`);
          actionsTaken.push(`Timeout expires <t:${timeoutExpiry}:R>`);
          logger.info(`[SPAM] Auto-timeout applied to ${member.user.tag} in guild ${guildId}`);
        }
      }
    } catch (err) {
      logger.error(`[SPAM] Error applying automatic action in guild ${guildId}: ${err.message}`);
    }

    const deleteCount = await this.deleteSpamMessages(message.guild, evidence);
    if (deleteCount > 0) {
      const channelCount = new Set(
        (evidence || []).map(ev => ev.channelId).filter(Boolean)
      ).size;
      actionsTaken.push(
        `Deleted ${deleteCount} message${deleteCount !== 1 ? 's' : ''} across ${channelCount} channel${channelCount !== 1 ? 's' : ''}`
      );
    }

    return actionsTaken;
  }

  async deleteSpamMessages(guild, evidence) {
    if (!evidence || evidence.length === 0) return 0;

    let deleted = 0;

    for (const ev of evidence) {
      const { channelId, messageId } = ev;
      if (!channelId || !messageId) {
        logger.warn(`[SPAM][DELETE] Skipping evidence entry — missing channelId or messageId`);
        continue;
      }

      try {
        let channel = guild.channels.cache.get(channelId);
        if (!channel) {
          channel = await this.client.channels.fetch(channelId).catch(() => null);
        }

        if (!channel) {
          logger.warn(
            `[SPAM][DELETE] Channel not found: channelId=${channelId}, messageId=${messageId}`
          );
          continue;
        }

        let msg = channel.messages?.cache?.get(messageId);
        if (!msg) {
          msg = await channel.messages.fetch(messageId).catch(() => null);
        }

        if (!msg) {
          logger.warn(
            `[SPAM][DELETE] Message not found: channelId=${channelId}, messageId=${messageId}`
          );
          continue;
        }

        await msg.delete();
        deleted++;
        logger.info(
          `[SPAM][DELETE] Deleted message: channelId=${channelId}, messageId=${messageId}`
        );
      } catch (err) {
        logger.error(
          `[SPAM][DELETE] Failed to delete message: channelId=${channelId}, messageId=${messageId} — ${err.message}`
        );
      }
    }

    return deleted;
  }

  getTimeoutSeconds(triggeredRules) {
    const cfg = spamDetector.config;
    for (const rule of triggeredRules) {
      const ruleKey = rule.name.replace(/ /g, '');
      const ruleCfg = cfg.rules[ruleKey];
      if (ruleCfg?.timeoutSeconds) return ruleCfg.timeoutSeconds;
    }
    return cfg.defaultTimeoutSeconds;
  }

  async markPendingReview(userId, alertMessage, updatedEmbed, guildId) {
    try {
      const pendingEmbed = buildPendingReviewEmbed({ originalEmbed: updatedEmbed });
      const components = [this.buildActionRow(userId)];

      await alertMessage.edit({ embeds: [pendingEmbed], components });

      const alertKey = buildAlertKey(guildId, userId);
      const alert = this.activeAlerts.get(alertKey);
      if (alert) {
        alert.embed = pendingEmbed;
      }

      logger.info(
        `[SPAM] Alert for ${userId} in guild ${guildId} updated to Pending Staff Review`
      );
    } catch (err) {
      logger.error(`[SPAM] Error marking alert as pending in guild ${guildId}: ${err.message}`);
    }
  }

  async lockAlert(userId, alertMessage, originalEmbed, actionDescription, moderatorTag, moderatorId, guildId) {
    try {
      const finalEmbed = buildFinalActionEmbed({
        originalEmbed,
        actionDescription,
        moderatorTag: moderatorTag || 'System',
        moderatorId: moderatorId || 'N/A'
      });

      await alertMessage.edit({ embeds: [finalEmbed], components: [] });

      const alertKey = buildAlertKey(guildId, userId);
      const alert = this.activeAlerts.get(alertKey);
      if (alert) {
        alert.locked = true;
        alert.embed = finalEmbed;
      }

      logger.info(
        `[SPAM] Alert for ${userId} in guild ${guildId} locked/resolved by ${moderatorTag || 'System'}`
      );
    } catch (err) {
      logger.error(`[SPAM] Error locking alert in guild ${guildId}: ${err.message}`);
    }
  }

  async handleInteraction(interaction) {
    try {
      const parts = interaction.customId.split(':');
      const actionType = parts[0];
      const userId = parts[1];
      const guildId = interaction.guildId;
      const alertKey = buildAlertKey(guildId, userId);
      const alert = this.activeAlerts.get(alertKey);

      if (!alert || alert.locked) {
        return interaction.reply({ content: 'This alert is already resolved.', ephemeral: true });
      }

      const member = await fetchMemberSafe(interaction.guild, userId, 2000);

      let actionDescription = '';

      switch (actionType) {
        case 'spam_confirm':
          actionDescription = 'Confirmed as spam — timeout kept';
          break;

        case 'spam_falsePositive':
          if (member) await modActions.removeTimeout(member, 'Marked as false positive');
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

      await this.lockAlert(
        userId,
        alert.message,
        alert.embed,
        actionDescription,
        interaction.user.tag,
        interaction.user.id,
        guildId
      );

      await interaction.reply({
        content: `✅ Action applied: ${actionDescription}`,
        ephemeral: true
      });

      logger.info(
        `[SPAM] Moderator action by ${interaction.user.tag} in guild ${guildId}: ${actionDescription} for user ${userId}`
      );
    } catch (err) {
      logger.error(`[SPAM] Error handling interaction: ${err.message}`);
      await interaction.reply({
        content: '❌ An error occurred while processing your action.',
        ephemeral: true
      }).catch(() => {});
    }
  }

  resetUserState(guildId, userId) {
    const alertKey = buildAlertKey(guildId, userId);
    this.activeAlerts.delete(alertKey);
    this.alertLocks.delete(alertKey);
    logger.info(`[SPAM] State reset for user ${userId} in guild ${guildId}`);
  }

  resetAllState() {
    const count = this.activeAlerts.size;
    this.activeAlerts.clear();
    this.alertLocks.clear();
    logger.info(`[SPAM] State reset for all users (${count} entries cleared)`);
    return count;
  }
}

SpamActionHandler.instance = null;

module.exports = SpamActionHandler;
