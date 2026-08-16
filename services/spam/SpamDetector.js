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
      return { enabled: false, rules: {}, whitelist: { users: [], roles: [] } };
    }
  }

  reloadConfig() {
    this.config = this.loadConfig();
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

  async detectSpam(message, member) {
    if (!this.config.enabled) return null;
    if (message.author.bot) return null;
    if (this.isWhitelisted(member)) return null;

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

    // Run rule modules
    const ruleResults = [
      multiChannelSpam(message, activity, cfg.multiChannelSpam),
      rapidPosting(message, activity, cfg.rapidPosting),
      imageSpam(message, activity, cfg.imageSpam),
      suspiciousPatterns(message, activity, cfg.suspiciousPatterns, activityStats),
      newAccountRule(member, cfg.newAccountMonitoring, triggeredRules),
      dormantUserSpam(message, activityStats, cfg.dormantUserSpam),
      channelCarpetBomb(message, activity, cfg.channelCarpetBomb),

      // NEW advanced rules
      await dormantActivation(message, activityStats),
      await singleImageScam(message, activityStats)
    ];

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
      triggeredRules,
      evidence: evidence.length > 0 ? evidence : this.getRecentMessages(userId, 3),
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
}

module.exports = new SpamDetector();
