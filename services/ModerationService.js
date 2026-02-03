const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class ModerationService {
  constructor() {
    this.warningsPath = path.join(__dirname, '../data/warnings.json');
    this.warnings = this.loadWarnings();
  }

  loadWarnings() {
    try {
      if (fs.existsSync(this.warningsPath)) {
        const data = fs.readFileSync(this.warningsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load warnings:', error);
    }
    // Initialize with empty structure if file doesn't exist
    return {};
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
    if (!this.warnings[userId]) {
      this.warnings[userId] = [];
    }

    const warning = {
      id: Date.now().toString(),
      moderatorId,
      reason,
      timestamp: Date.now(),
      guildId
    };

    this.warnings[userId].push(warning);
    this.saveWarnings();

    logger.info(`[MODERATION] Warning added to user ${userId} by ${moderatorId}: ${reason}`);
    
    return {
      warning,
      totalWarnings: this.warnings[userId].length
    };
  }

  getUserWarnings(userId) {
    return this.warnings[userId] || [];
  }

  clearUserWarnings(userId) {
    const count = this.warnings[userId]?.length || 0;
    delete this.warnings[userId];
    this.saveWarnings();

    logger.info(`[MODERATION] Cleared ${count} warnings for user ${userId}`);
    
    return count;
  }

  getTotalWarnings(userId) {
    return this.warnings[userId]?.length || 0;
  }

  getAllWarnings() {
    return this.warnings;
  }

  // Get warnings count across all users
  getGlobalStats() {
    let totalUsers = 0;
    let totalWarnings = 0;

    for (const userId in this.warnings) {
      totalUsers++;
      totalWarnings += this.warnings[userId].length;
    }

    return { totalUsers, totalWarnings };
  }
}

module.exports = new ModerationService();
