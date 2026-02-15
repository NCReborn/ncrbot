const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

/**
 * Tracks persistent user activity history across guilds
 * Records messages, links, and media for spam detection
 */
class UserActivityTracker {
  constructor() {
    this.dataPath = path.join(__dirname, '../../data/userActivity.json');
    this.data = this.loadData();
    
    // Auto-save every 5 minutes
    setInterval(() => this.saveData(), 5 * 60 * 1000);
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const raw = fs.readFileSync(this.dataPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (error) {
      logger.error('[UserActivityTracker] Failed to load data:', error);
    }
    return {};
  }

  saveData() {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error('[UserActivityTracker] Failed to save data:', error);
    }
  }

  /**
   * Get the key for storing user activity
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @returns {string} Storage key
   */
  getKey(guildId, userId) {
    return `${guildId}-${userId}`;
  }

  /**
   * Record a message from a user
   * @param {Object} message - Discord message object
   * @param {Object} member - Discord member object
   */
  recordMessage(message, member) {
    const key = this.getKey(message.guildId, message.author.id);
    
    if (!this.data[key]) {
      this.data[key] = {
        userId: message.author.id,
        guildId: message.guildId,
        messages: 0,
        links: 0,
        media: 0,
        firstMessageAt: Date.now(),
        lastMessageAt: Date.now()
      };
    }

    const activity = this.data[key];
    
    // Increment message count
    activity.messages++;
    activity.lastMessageAt = Date.now();

    // Count links in message content
    // Match URLs, stopping before trailing punctuation at end of URL
    const linkMatches = message.content.match(/https?:\/\/[^\s]+?(?=\s|[.,;:!?)\]]+\s|[.,;:!?)\]]+$|$)/g);
    if (linkMatches) {
      activity.links += linkMatches.length;
    }

    // Count media attachments (images/videos)
    if (message.attachments.size > 0) {
      const mediaAttachments = Array.from(message.attachments.values()).filter(attachment => {
        const contentType = attachment.contentType || '';
        return contentType.startsWith('image/') || contentType.startsWith('video/');
      });
      activity.media += mediaAttachments.length;
    }

    // Count embeds with images
    if (message.embeds.length > 0) {
      const embedsWithImages = message.embeds.filter(embed => embed.image || embed.thumbnail);
      activity.media += embedsWithImages.length;
    }
  }

  /**
   * Get activity stats for a user in a guild
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @returns {Object|null} Activity stats or null if not found
   */
  getActivity(guildId, userId) {
    const key = this.getKey(guildId, userId);
    return this.data[key] || null;
  }

  /**
   * Check if a user is dormant (little to no activity)
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @param {Object} options - Options for dormancy check
   * @returns {boolean} True if user is dormant
   */
  isDormant(guildId, userId, options = {}) {
    const {
      maxMessages = 2,
      maxMedia = 0
    } = options;

    const activity = this.getActivity(guildId, userId);
    
    // If no activity record, consider dormant
    if (!activity) {
      return true;
    }

    // Check if user has minimal activity
    return activity.messages <= maxMessages && activity.media <= maxMedia;
  }

  /**
   * Get server age for a user (time since first message)
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @returns {number} Days since first message, or 0 if no activity
   */
  getServerAge(guildId, userId) {
    const activity = this.getActivity(guildId, userId);
    if (!activity) return 0;

    const ageMs = Date.now() - activity.firstMessageAt;
    return ageMs / (1000 * 60 * 60 * 24); // Convert to days
  }

  /**
   * Clean up old/inactive users (optional, to prevent bloat)
   * Removes users with no activity in the last 90 days
   */
  cleanup() {
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
    const now = Date.now();
    let removed = 0;

    for (const [key, activity] of Object.entries(this.data)) {
      if (now - activity.lastMessageAt > maxAge) {
        delete this.data[key];
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`[UserActivityTracker] Cleaned up ${removed} inactive users`);
      this.saveData();
    }
  }
}

module.exports = new UserActivityTracker();
