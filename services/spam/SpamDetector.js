// services/spam/SpamDetector.js

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const CONSTANTS = require('../../config/constants');
const userActivityTracker = require('./UserActivityTracker');

// Load rule modules
const multiChannelSpam = require('./rules/multiChannelSpam');
const rapidPosting = require('./rules/rapidPosting');
const imageSpam = require('./rules/imageSpam');
const suspiciousPatterns = require('./rules/suspiciousPatterns');
const newAccountRule = require('./rules/newAccount');
const dormantUserSpam = require('./rules/dormantUserSpam');
const channelCarpetBomb = require('./rules/channelCarpetBomb');

// NEW advanced rules
const dormantActivation = require('./rules/dormantActivation');
const singleImageScam = require('./rules/singleImageScam');

const CONTENT_PREVIEW_LENGTH = 100;
const DEBUG_TRIGGER_DESCRIPTIONS = {
  'Multi-Channel Spam': 'Forced by anti-spam debug trigger',
  'Channel Carpet-Bomb': 'Forced by anti-spam debug trigger',
  'Image Spam': 'Forced by anti-spam debug trigger'
};

class SpamDetector {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/spamConfig.json');
    this.config = this.loadConfig();

    // Track user activity: userId -> { messages: [], channels: Set, images: [] }
    this.userActivity = new Map();

    // Clean up old activity every 5 minutes
    setInterval(() => this.cleanupOldActivity(), 5 * 60 * 1000);
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load spam config:', error);
      return {
        enabled: false,
        rules: {},
        whitelist: { users: [], roles: [] },
        debug: { enabled: false, testUserId: null }
      };
    }
  }

  reloadConfig() {
    this.config = this.loadConfig();
  }

  /**
   * Returns true if the given channelId is in the configured protected channels list.
   * Uses channel IDs as source of truth (not names).
   */
  isProtectedChannel(channelId) {
    if (!channelId) return false;
    const protected_ = this.config.protectedChannels || {};
    return Object.values(protected_).includes(channelId);
  }

  isWhitelisted(member) {
    if (!member) return false;

    // Check if user is in whitelist
    if (this.config.whitelist.users.includes(member.user.id)) {
      return true;
    }

    // Check if user has whitelisted role
    if (this.config.whitelist.roles.some(roleId => member.roles.cache.has(roleId))) {
      return true;
    }

    // Auto-whitelist moderators
    if (CONSTANTS.ROLES.MODERATOR.some(roleId => member.roles.cache.has(roleId))) {
      return true;
    }

    // Auto-whitelist server boosters
    if (member.premiumSince) {
      return true;
    }

    return false;
  }

  trackMessage(message, member) {
    const userId = message.author.id;

    if (!this.userActivity.has(userId)) {
      this.userActivity.set(userId, {
        messages: [],
        channels: new Set(),
        images: []
      });
    }

    const activity = this.userActivity.get(userId);
    const now = Date.now();

    activity.messages.push({
      id: message.id,
      channelId: message.channelId,
      content: message.content,
      timestamp: now,
      hasImage: message.attachments.size > 0 || this.hasImageEmbed(message),
      attachments: Array.from(message.attachments.values()).map(a => ({ url: a.url, name: a.name }))
    });

    activity.channels.add(message.channelId);

    if (message.attachments.size > 0 || this.hasImageEmbed(message)) {
      activity.images.push({
        messageId: message.id,
        channelId: message.channelId,
        timestamp: now
      });
    }
  }

  hasImageEmbed(message) {
    return message.embeds.some(embed => embed.image || embed.thumbnail);
  }

  cleanupOldActivity() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000;

    for (const [userId, activity] of this.userActivity.entries()) {
      activity.messages = activity.messages.filter(msg => now - msg.timestamp < maxAge);
      activity.images = activity.images.filter(img => now - img.timestamp < maxAge);

      activity.channels = new Set(activity.messages.map(msg => msg.channelId));

      if (activity.messages.length === 0) {
        this.userActivity.delete(userId);
      }
    }
  }

  isDebugTestMessage(message) {
    const debug = this.config.debug || {};
    return Boolean(
      debug.enabled &&
      debug.testUserId &&
      message?.author?.id === debug.testUserId
    );
  }

  getDebugForcedRuleResults(message, cfg) {
    const content = (message.content || '').toLowerCase();
    const hasMultiTrigger = content.includes('test:multi') || content.includes('multi channel spamming');
    const hasCarpetTrigger = content.includes('test:carpet') || content.includes('carpet bombing');
    const hasImageTrigger = content.includes('test:image') || content.includes('image spam');
    const forcedResults = [];

    if (hasMultiTrigger) {
      forcedResults.push({
        triggered: true,
        ruleName: 'Multi-Channel Spam',
        description: DEBUG_TRIGGER_DESCRIPTIONS['Multi-Channel Spam'],
        severity: cfg.multiChannelSpam?.severity || 'high',
        score: 2,
        evidence: []
      });
    }

    if (hasCarpetTrigger) {
      forcedResults.push({
        triggered: true,
        ruleName: 'Channel Carpet-Bomb',
        description: DEBUG_TRIGGER_DESCRIPTIONS['Channel Carpet-Bomb'],
        severity: cfg.channelCarpetBomb?.severity || 'critical',
        score: 3,
        evidence: []
      });
    }

    if (hasImageTrigger) {
      forcedResults.push({
        triggered: true,
        ruleName: 'Image Spam',
        description: DEBUG_TRIGGER_DESCRIPTIONS['Image Spam'],
        severity: cfg.imageSpam?.severity || 'high',
        score: 2,
        evidence: []
      });
    }

    if (forcedResults.length > 0) {
      logger.info(`[SPAM][DEBUG] Forced triggers for ${message.author.tag}: ${forcedResults.map(r => r.ruleName).join(', ')}`);
    }

    return forcedResults;
  }

  async detectSpam(message, member) {
    if (!this.config.enabled) return null;
    if (message.author.bot) return null;
    const isDebugTestMessage = this.isDebugTestMessage(message);
    if (!isDebugTestMessage && this.isWhitelisted(member)) return null;

    // Hard bypass: protected channels must never contribute to scoring/escalation
    if (this.isProtectedChannel(message.channelId)) {
      logger.info(`[SPAM] Skipping detection for message in protected channel ${message.channelId} (user ${message.author.id})`);
      return null;
    }

    // Persistent activity tracker
    userActivityTracker.recordMessage(message, member);

    // Local activity tracker
    this.trackMessage(message, member);

    const userId = message.author.id;
    const activity = this.userActivity.get(userId);
    const activityStats = userActivityTracker.getActivity(message.guildId, userId);

    const triggeredRules = [];
    const evidence = [];

    // Load rule configs
    const cfg = this.config.rules;

    // Run synchronous rule modules
    const syncRuleResults = [
      multiChannelSpam(message, activity, cfg.multiChannelSpam),
      rapidPosting(message, activity, cfg.rapidPosting),
      imageSpam(message, activity, cfg.imageSpam),
      suspiciousPatterns(message, activity, cfg.suspiciousPatterns, activityStats),
      newAccountRule(member, cfg.newAccountMonitoring, triggeredRules),
      dormantUserSpam(message, activityStats, cfg.dormantUserSpam),
      channelCarpetBomb(message, activity, cfg.channelCarpetBomb)
    ];

    // Run async rule modules and wait for results
    let asyncRuleResults = [];
    try {
      const asyncRules = [];

      if (cfg.dormantActivation?.enabled) {
        asyncRules.push(dormantActivation(message, activityStats));
      }

      if (cfg.singleImageScam?.enabled) {
        asyncRules.push(singleImageScam(message, activityStats));
      }

      if (asyncRules.length > 0) {
        asyncRuleResults = await Promise.all(asyncRules);
      }
    } catch (err) {
      logger.error(`[SPAM] Error running async rules: ${err.message}`);
    }

    // Combine all rule results
    const ruleResults = [...syncRuleResults, ...asyncRuleResults];

    if (isDebugTestMessage) {
      const forcedRuleResults = this.getDebugForcedRuleResults(message, cfg);
      for (const forcedResult of forcedRuleResults) {
        const alreadyTriggered = ruleResults.some(result => result?.triggered && result.ruleName === forcedResult.ruleName);
        if (!alreadyTriggered) {
          ruleResults.push(forcedResult);
        }
      }
    }

    // Collect triggered rules
    for (const result of ruleResults) {
      if (result && result.triggered) {
        triggeredRules.push({
          name: result.ruleName,
          description: result.description || "",
          severity: result.severity || "high",
          score: result.score || 1
        });

        if (result.evidence?.length > 0) {
          evidence.push(...result.evidence);
        }
      }
    }

    if (triggeredRules.length === 0) {
      return null;
    }

    // De-duplicate evidence by canonical key (guildId:channelId:messageId).
    // Only include entries that have at minimum channelId + messageId.
    const guildId = message.guildId;
    const evidenceKeysSeen = new Set();
    const validEvidence = [];
    for (const ev of evidence) {
      if (!ev.channelId || !ev.messageId) {
        logger.debug(`[SPAM] Dropping evidence entry missing channelId or messageId`);
        continue;
      }
      const key = `${guildId}:${ev.channelId}:${ev.messageId}`;
      if (evidenceKeysSeen.has(key)) {
        logger.debug(`[SPAM] Dropping duplicate evidence entry ${key}`);
        continue;
      }
      evidenceKeysSeen.add(key);
      validEvidence.push(ev);
    }

    // Fall back to recent messages if no valid evidence collected; exclude protected channels
    const resolvedEvidence = validEvidence.length > 0
      ? validEvidence
      : this.getRecentMessages(userId, 3).filter(
          msg => msg.channelId && !this.isProtectedChannel(msg.channelId)
        );

    // Confidence scoring
    const severityPoints = { critical: 3, high: 2, warning: 1 };
    const confidenceScore = triggeredRules.reduce((sum, rule) => {
      return sum + (severityPoints[rule.severity] || 0);
    }, 0);

    const threshold = this.config.confidenceThreshold ?? 3;

    const onlySuspiciousPattern =
      triggeredRules.length === 1 && triggeredRules[0].name === "Suspicious Pattern";

    const confidenceLevel =
      (onlySuspiciousPattern || confidenceScore < threshold) ? "low" : "high";

    return {
      detected: true,
      userId,
      guildId,
      userTag: member.user.tag,
      triggeredRules,
      evidence: resolvedEvidence,
      accountCreated: member.user.createdTimestamp,
      joinedServer: member.joinedTimestamp,
      isNewAccount: newAccountRule(member, cfg.newAccountMonitoring, triggeredRules).triggered,
      activityStats,
      confidenceScore,
      confidenceLevel
    };
  }

  getRecentMessages(userId, limit = 5) {
    const activity = this.userActivity.get(userId);
    if (!activity) return [];

    return activity.messages
      .slice(-limit)
      .map(msg => ({
        messageId: msg.id,
        channelId: msg.channelId,
        content: msg.content.substring(0, CONTENT_PREVIEW_LENGTH),
        attachments: msg.attachments || []
      }));
  }

  getUserActivity(userId) {
    return this.userActivity.get(userId) || null;
  }

  /**
   * Clear all tracked activity for a user.
   * Used by debug reset commands so a new test run starts clean.
   */
  resetUserState(userId) {
    this.userActivity.delete(userId);
    logger.info(`[SPAM][DETECTOR] Activity state reset for user ${userId}`);
  }

  /**
   * Clear tracked activity for all users.
   */
  resetAllState() {
    const count = this.userActivity.size;
    this.userActivity.clear();
    logger.info(`[SPAM][DETECTOR] Activity state reset for all users (${count} entries cleared)`);
    return count;
  }
}

module.exports = new SpamDetector();
