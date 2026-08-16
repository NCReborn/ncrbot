// services/spam/UserActivityTracker.js

/**
 * UserActivityTracker
 * -------------------
 * Tracks long-term user activity across the server:
 * - Total messages
 * - Total media
 * - Total links
 * - First message timestamp
 * - Last message timestamp
 * - Server join age
 *
 * NEW: Compromise signal tracking
 * - lastAvatarChange
 * - lastUsernameChange
 * - lastPresenceChange
 * - lastDeviceChange
 */

const logger = require('../../utils/logger');

class UserActivityTracker {
  constructor() {
    /**
     * Structure:
     * guildId -> userId -> {
     *   messages: number,
     *   media: number,
     *   links: number,
     *   firstMessageTimestamp: number,
     *   lastMessageTimestamp: number,
     *   serverJoinTimestamp: number,
     *
     *   // NEW compromise signals
     *   lastAvatarChange: number,
     *   lastUsernameChange: number,
     *   lastPresenceChange: number,
     *   lastDeviceChange: number
     * }
     */
    this.activity = new Map();
  }

  /**
   * Ensure guild + user entry exists
   */
  ensureEntry(guildId, userId, member) {
    if (!this.activity.has(guildId)) {
      this.activity.set(guildId, new Map());
    }

    const guildMap = this.activity.get(guildId);

    if (!guildMap.has(userId)) {
      guildMap.set(userId, {
        messages: 0,
        media: 0,
        links: 0,
        firstMessageTimestamp: null,
        lastMessageTimestamp: null,
        serverJoinTimestamp: member?.joinedTimestamp || Date.now(),

        // NEW compromise signals
        lastAvatarChange: null,
        lastUsernameChange: null,
        lastPresenceChange: null,
        lastDeviceChange: null
      });
    }

    return guildMap.get(userId);
  }

  /**
   * Record a message into persistent activity
   */
  recordMessage(message, member) {
    const guildId = message.guildId;
    const userId = message.author.id;

    const entry = this.ensureEntry(guildId, userId, member);

    const now = Date.now();

    // First message timestamp
    if (!entry.firstMessageTimestamp) {
      entry.firstMessageTimestamp = now;
    }

    // Last message timestamp
    entry.lastMessageTimestamp = now;

    // Message count
    entry.messages++;

    // Media count
    if (message.attachments.size > 0 || message.embeds.some(e => e.image || e.thumbnail)) {
      entry.media++;
    }

    // Link count
    if (message.content.includes('http://') || message.content.includes('https://')) {
      entry.links++;
    }
  }

  /**
   * Track avatar changes
   */
  recordAvatarChange(guildId, userId) {
    const entry = this.ensureEntry(guildId, userId);
    entry.lastAvatarChange = Date.now();
  }

  /**
   * Track username changes
   */
  recordUsernameChange(guildId, userId) {
    const entry = this.ensureEntry(guildId, userId);
    entry.lastUsernameChange = Date.now();
  }

  /**
   * Track presence changes (offline → online)
   */
  recordPresenceChange(guildId, userId) {
    const entry = this.ensureEntry(guildId, userId);
    entry.lastPresenceChange = Date.now();
  }

  /**
   * Track device changes (mobile → desktop, etc.)
   */
  recordDeviceChange(guildId, userId) {
    const entry = this.ensureEntry(guildId, userId);
    entry.lastDeviceChange = Date.now();
  }

  /**
   * Get activity stats for a user
   */
  getActivity(guildId, userId) {
    const guildMap = this.activity.get(guildId);
    if (!guildMap) return null;

    return guildMap.get(userId) || null;
  }

  /**
   * Get how long a user has been in the server (days)
   */
  getServerAge(guildId, userId) {
    const entry = this.getActivity(guildId, userId);
    if (!entry || !entry.serverJoinTimestamp) return 0;

    const now = Date.now();
    return Math.floor((now - entry.serverJoinTimestamp) / (1000 * 60 * 60 * 24));
  }
}

module.exports = new UserActivityTracker();
