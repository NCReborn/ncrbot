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
const newAccountRule = require('./rules/newAccount');
const channelCarpetBomb = require('./rules/channelCarpetBomb');

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

    this.userActivity = new Map();

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
        debug: { enabled: false, testUserId: null },
        protectedChannels: {},
        confidenceThreshold: 3,
        defaultTimeoutSeconds: 3600
      };
    }
  }

  reloadConfig() {
    this.config = this.loadConfig();
  }

  isProtectedChannel(channelId, guildId) {
    if (!channelId) return false;

    const guildCfg = this.config.guilds?.[guildId];
    const protected_ = guildCfg?.protectedChannels || this.config.protectedChannels || {};

    return Object.values(protected_).includes(channelId);
  }

  isWhitelisted(member) {
    if (!member) return false;

    if (this.config.whitelist.users.includes(member.user.id)) return true;

    if (this.config.whitelist.roles.some(roleId => member.roles.cache.has(roleId))) return true;

    if (CONSTANTS.ROLES.MODERATOR.some(roleId => member.roles.cache.has(roleId))) return true;

    if (member.premiumSince) return true;

    return false;
  }

  trackMessage(message, member) {
    const userId = message.author.id;
    const guildId = message.guildId;
    const key = `${guildId}:${userId}`;

    if (!this.userActivity.has(key)) {
      this.userActivity.set(key, {
        messages: [],
        channels: new Set(),
        images: []
      });
    }

    const activity = this.userActivity.get(key);
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

    for (const [key, activity] of this.userActivity.entries()) {
      activity.messages = activity.messages.filter(msg => now - msg.timestamp < maxAge);
      activity.images = activity.images.filter(img => now - img.timestamp < maxAge);

      activity.channels = new Set(activity.messages.map(msg => msg.channelId));

      if (activity.messages.length === 0) {
        this.userActivity.delete(key);
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

    return forcedResults;
  }

  async detectSpam(message, member) {
    if (!this.config.enabled) return null;
    if (message.author.bot) return null;

    const guildId = message.guildId;
    const userId = message.author.id;
    const key = `${guildId}:${userId}`;

    const guildCfg = this.config.guilds?.[guildId];
    const cfg = guildCfg?.rules || this.config.rules || {};

    const isDebugTestMessage = this.isDebugTestMessage(message);
    if (!isDebugTestMessage && this.isWhitelisted(member)) return null;

    if (this.isProtectedChannel(message.channelId, guildId)) {
      return null;
    }

    userActivityTracker.recordMessage(message, member);
    this.trackMessage(message, member);

    const activity = this.userActivity.get(key);
    const activityStats = userActivityTracker.getActivity(guildId, userId);

    const triggeredRules = [];
    const evidence = [];

    const syncRuleResults = [
      multiChannelSpam(message, activity, cfg.multiChannelSpam),
      rapidPosting(message, activity, cfg.rapidPosting),
      imageSpam(message, activity, cfg.imageSpam),
      newAccountRule(member, cfg.newAccountMonitoring, triggeredRules),
      channelCarpetBomb(message, activity, cfg.channelCarpetBomb)
    ];

    const ruleResults = [...syncRuleResults];

    if (isDebugTestMessage) {
      const forcedRuleResults = this.getDebugForcedRuleResults(message, cfg);
      for (const forcedResult of forcedRuleResults) {
        const alreadyTriggered = ruleResults.some(
          result => result?.triggered && result.ruleName === forcedResult.ruleName
        );
        if (!alreadyTriggered) {
          ruleResults.push(forcedResult);
        }
      }
    }

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

    const evidenceKeysSeen = new Set();
    const validEvidence = [];
    for (const ev of evidence) {
      if (!ev.channelId || !ev.messageId) continue;
      const evKey = `${guildId}:${ev.channelId}:${ev.messageId}`;
      if (evidenceKeysSeen.has(evKey)) continue;
      evidenceKeysSeen.add(evKey);
      validEvidence.push(ev);
    }

    const resolvedEvidence = validEvidence.length > 0
      ? validEvidence
      : this.getRecentMessages(guildId, userId, 10).filter(
          msg => msg.channelId && !this.isProtectedChannel(msg.channelId, guildId)
        );

    const severityPoints = { critical: 3, high: 2, warning: 1 };
    const confidenceScore = triggeredRules.reduce((sum, rule) => {
      return sum + (severityPoints[rule.severity] || 0);
    }, 0);

    const threshold = this.config.confidenceThreshold ?? 3;

    const confidenceLevel =
      confidenceScore < threshold ? "low" : "high";

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

  getRecentMessages(guildId, userId, limit = 5) {
    const key = `${guildId}:${userId}`;
    const activity = this.userActivity.get(key);
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

  getUserActivity(guildId, userId) {
    const key = `${guildId}:${userId}`;
    return this.userActivity.get(key) || null;
  }

  resetUserState(guildId, userId) {
    const key = `${guildId}:${userId}`;
    this.userActivity.delete(key);
  }

  resetAllState() {
    const count = this.userActivity.size;
    this.userActivity.clear();
    return count;
  }
}

module.exports = new SpamDetector();
