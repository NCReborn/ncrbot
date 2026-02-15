const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const CONSTANTS = require('../../config/constants');
const userActivityTracker = require('./UserActivityTracker');

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

    // Track message with timestamp
    activity.messages.push({
      id: message.id,
      channelId: message.channelId,
      content: message.content,
      timestamp: now,
      hasImage: message.attachments.size > 0 || this.hasImageEmbed(message)
    });

    // Track channel
    activity.channels.add(message.channelId);

    // Track images
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
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [userId, activity] of this.userActivity.entries()) {
      // Remove old messages
      activity.messages = activity.messages.filter(msg => now - msg.timestamp < maxAge);
      activity.images = activity.images.filter(img => now - img.timestamp < maxAge);

      // Rebuild channels set from current messages
      activity.channels = new Set(activity.messages.map(msg => msg.channelId));

      // Remove user if no recent activity
      if (activity.messages.length === 0) {
        this.userActivity.delete(userId);
      }
    }
  }

  isNewAccount(member) {
    const accountAge = Date.now() - member.user.createdTimestamp;
    const daysOld = accountAge / (1000 * 60 * 60 * 24);
    return daysOld < (this.config.rules.newAccountMonitoring?.accountAgeDays || 7);
  }

  async detectSpam(message, member) {
    // Skip if system is disabled
    if (!this.config.enabled) return null;

    // Skip bots
    if (message.author.bot) return null;

    // Skip whitelisted users
    if (this.isWhitelisted(member)) return null;

    // Record message in persistent activity tracker
    userActivityTracker.recordMessage(message, member);

    // Track this message
    this.trackMessage(message, member);

    const userId = message.author.id;
    const activity = this.userActivity.get(userId);
    const now = Date.now();

    const triggeredRules = [];
    const evidence = [];

    // 1. Multi-Channel Spam Detection
    if (this.config.rules.multiChannelSpam?.enabled) {
      const rule = this.config.rules.multiChannelSpam;
      const timeWindow = rule.timeWindowSeconds * 1000;
      
      const recentMessages = activity.messages.filter(msg => 
        now - msg.timestamp < timeWindow
      );

      const uniqueChannels = new Set(recentMessages.map(msg => msg.channelId));
      
      if (uniqueChannels.size >= rule.channelCount) {
        const timeSpan = ((now - recentMessages[0].timestamp) / 1000).toFixed(0);
        triggeredRules.push({
          name: 'Multi-Channel Spam',
          description: `Posted in ${uniqueChannels.size} channels in ${timeSpan} seconds`,
          severity: 'high'
        });
        
        // Add evidence
        recentMessages.slice(0, 5).forEach(msg => {
          evidence.push({
            messageId: msg.id,
            channelId: msg.channelId,
            content: msg.content.substring(0, CONTENT_PREVIEW_LENGTH)
          });
        });
      }
    }

    // 2. Rapid Posting Detection
    if (this.config.rules.rapidPosting?.enabled) {
      const rule = this.config.rules.rapidPosting;
      
      // Skip if in excluded channel
      if (!rule.excludeChannels.includes(message.channelId)) {
        const timeWindow = rule.timeWindowSeconds * 1000;
        
        const recentMessages = activity.messages.filter(msg => 
          now - msg.timestamp < timeWindow
        );

        if (recentMessages.length >= rule.messageCount) {
          const timeSpan = ((now - recentMessages[0].timestamp) / 1000).toFixed(0);
          triggeredRules.push({
            name: 'Rapid Posting',
            description: `Posted ${recentMessages.length} messages in ${timeSpan} seconds`,
            severity: 'high'
          });
        }
      }
    }

    // 3. Image Spam Detection
    if (this.config.rules.imageSpam?.enabled) {
      const rule = this.config.rules.imageSpam;
      
      // Skip if in excluded channel
      if (!rule.excludeChannels.includes(message.channelId)) {
        const timeWindow = rule.timeWindowSeconds * 1000;
        
        const recentImages = activity.images.filter(img => 
          now - img.timestamp < timeWindow
        );

        if (recentImages.length >= rule.imageCount) {
          const timeSpan = ((now - recentImages[0].timestamp) / 1000).toFixed(0);
          triggeredRules.push({
            name: 'Image Spam',
            description: `Posted ${recentImages.length} images in ${timeSpan} seconds`,
            severity: 'high'
          });
        }
      }
    }

    // 4. Suspicious Pattern Detection
    if (this.config.rules.suspiciousPatterns?.enabled) {
      const rule = this.config.rules.suspiciousPatterns;
      const content = rule.caseSensitive ? message.content : message.content.toLowerCase();
      
      for (const pattern of rule.patterns) {
        const searchPattern = rule.caseSensitive ? pattern : pattern.toLowerCase();
        if (content.includes(searchPattern)) {
          triggeredRules.push({
            name: 'Suspicious Pattern',
            description: `"${pattern}" detected`,
            severity: 'critical'
          });
          
          evidence.push({
            messageId: message.id,
            channelId: message.channelId,
            content: message.content.substring(0, CONTENT_PREVIEW_LENGTH)
          });
          break;
        }
      }
    }

    // 5. New Account Monitoring
    const isNewAccount = this.isNewAccount(member);
    if (this.config.rules.newAccountMonitoring?.enabled && isNewAccount) {
      const requiresOtherTrigger = this.config.rules.newAccountMonitoring.requiresOtherTrigger;
      
      // Only flag if other rules were triggered OR if requiresOtherTrigger is false
      if (!requiresOtherTrigger || triggeredRules.length > 0) {
        const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60));
        triggeredRules.push({
          name: 'New Account',
          description: `Account <7 days old (${accountAge} hours)`,
          severity: 'warning'
        });
      }
    }

    // 6. Dormant User Spam Detection
    if (this.config.rules.dormantUserSpam?.enabled) {
      const rule = this.config.rules.dormantUserSpam;
      const serverAge = userActivityTracker.getServerAge(message.guildId, message.author.id);
      
      // Check if user has been in server long enough
      if (serverAge >= rule.minServerAgeDays) {
        const activity = userActivityTracker.getActivity(message.guildId, message.author.id);
        
        // Check if user is dormant (including current message)
        const totalMessages = activity ? activity.messages : 0;
        const totalMedia = activity ? activity.media : 0;
        
        // Count images in current message
        let currentImageCount = 0;
        if (message.attachments.size > 0) {
          const imageAttachments = Array.from(message.attachments.values()).filter(attachment => {
            const contentType = attachment.contentType || '';
            return contentType.startsWith('image/');
          });
          currentImageCount += imageAttachments.length;
        }
        if (message.embeds.length > 0) {
          const embedsWithImages = message.embeds.filter(embed => embed.image || embed.thumbnail);
          currentImageCount += embedsWithImages.length;
        }
        
        // Check dormant criteria: low messages, no historical media, but posting multiple images now
        if (totalMessages <= rule.maxHistoricalMessages && 
            totalMedia - currentImageCount <= rule.maxHistoricalMedia && 
            currentImageCount >= rule.minCurrentImages) {
          
          triggeredRules.push({
            name: 'Dormant User Spam',
            description: `Dormant user (${totalMessages} msg, ${totalMedia - currentImageCount} prev media) posting ${currentImageCount} images`,
            severity: rule.severity || 'high'
          });
          
          evidence.push({
            messageId: message.id,
            channelId: message.channelId,
            content: message.content.substring(0, CONTENT_PREVIEW_LENGTH)
          });
        }
      }
    }

    // Return detection result
    if (triggeredRules.length > 0) {
      const activityStats = userActivityTracker.getActivity(message.guildId, message.author.id);
      
      return {
        detected: true,
        userId: userId,
        triggeredRules,
        evidence: evidence.length > 0 ? evidence : this.getRecentMessages(userId, 3),
        accountCreated: member.user.createdTimestamp,
        joinedServer: member.joinedTimestamp,
        isNewAccount,
        activityStats: activityStats || {
          messages: 0,
          links: 0,
          media: 0,
          firstMessageAt: Date.now(),
          lastMessageAt: Date.now()
        }
      };
    }

    return null;
  }

  getRecentMessages(userId, limit = 5) {
    const activity = this.userActivity.get(userId);
    if (!activity) return [];

    return activity.messages
      .slice(-limit)
      .map(msg => ({
        messageId: msg.id,
        channelId: msg.channelId,
        content: msg.content.substring(0, CONTENT_PREVIEW_LENGTH)
      }));
  }

  // Public method to get user activity for debugging
  getUserActivity(userId) {
    return this.userActivity.get(userId) || null;
  }
}

module.exports = new SpamDetector();
