const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class ModerationService {
  constructor() {
    this.warningsPath = path.join(__dirname, '../data/warnings.json');
    this.warnings = this.loadWarnings();
  }

  // Shape is { [guildId]: { [userId]: [warning, ...] } }. Used to be a
  // flat { [userId]: [warning, ...] } with no guild dimension at all --
  // every warning already carried its own guildId field, but nothing
  // ever read it, so /warnings and /clearwarnings operated across EVERY
  // guild the bot is in. A CPE mod running /clearwarnings on a user
  // would wipe that user's entirely unrelated NCR warning history too.
  // Detects the old flat shape on load and migrates it forward once,
  // regrouping each warning by its own recorded guildId (a user's old
  // warning list could span more than one guild).
  loadWarnings() {
    try {
      if (fs.existsSync(this.warningsPath)) {
        const data = fs.readFileSync(this.warningsPath, 'utf8');
        const parsed = JSON.parse(data);
        return this.migrateIfNeeded(parsed);
      }
    } catch (error) {
      logger.error('Failed to load warnings:', error);
    }
    return {};
  }

  migrateIfNeeded(parsed) {
    const firstValue = Object.values(parsed)[0];
    if (firstValue === undefined || !Array.isArray(firstValue)) {
      // Already in the new { guildId: { userId: [...] } } shape (or empty).
      return parsed;
    }

    logger.info('[MODERATION] Migrating warnings.json to per-guild storage...');
    const migrated = {};
    let migratedCount = 0;

    for (const [userId, userWarnings] of Object.entries(parsed)) {
      for (const warning of userWarnings) {
        const guildId = warning.guildId || 'unknown';
        if (!migrated[guildId]) migrated[guildId] = {};
        if (!migrated[guildId][userId]) migrated[guildId][userId] = [];
        migrated[guildId][userId].push(warning);
        migratedCount++;
      }
    }

    this.warnings = migrated;
    this.saveWarnings();
    logger.info(`[MODERATION] Migrated ${migratedCount} warning(s) across ${Object.keys(migrated).length} guild(s).`);
    return migrated;
  }

  saveWarnings() {
    try {
      const dir = path.dirname(this.warningsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.warningsPath, JSON.stringify(this.warnings, null, 2));
    } catch (error) {
      logger.error('Failed to save warnings:', error);
    }
  }

  addWarning(userId, moderatorId, reason, guildId) {
    if (!this.warnings[guildId]) this.warnings[guildId] = {};
    if (!this.warnings[guildId][userId]) this.warnings[guildId][userId] = [];

    const warning = {
      id: Date.now().toString(),
      moderatorId,
      reason,
      timestamp: Date.now(),
      guildId
    };

    this.warnings[guildId][userId].push(warning);
    this.saveWarnings();

    logger.info(`[MODERATION] Warning added to user ${userId} by ${moderatorId} in guild ${guildId}: ${reason}`);

    return {
      warning,
      totalWarnings: this.warnings[guildId][userId].length
    };
  }

  getUserWarnings(userId, guildId) {
    return this.warnings[guildId]?.[userId] || [];
  }

  clearUserWarnings(userId, guildId) {
    const count = this.warnings[guildId]?.[userId]?.length || 0;
    if (this.warnings[guildId]) {
      delete this.warnings[guildId][userId];
    }
    this.saveWarnings();

    logger.info(`[MODERATION] Cleared ${count} warning(s) for user ${userId} in guild ${guildId}`);

    return count;
  }

  getTotalWarnings(userId, guildId) {
    return this.warnings[guildId]?.[userId]?.length || 0;
  }

  getAllWarnings(guildId) {
    return this.warnings[guildId] || {};
  }

  // Warnings count for one guild.
  getGlobalStats(guildId) {
    const guildWarnings = this.warnings[guildId] || {};
    let totalUsers = 0;
    let totalWarnings = 0;

    for (const userId in guildWarnings) {
      totalUsers++;
      totalWarnings += guildWarnings[userId].length;
    }

    return { totalUsers, totalWarnings };
  }
}

module.exports = new ModerationService();
