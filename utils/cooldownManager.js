const logger = require('./logger');

/**
 * Unified cooldown management system
 * Handles rate limiting for commands, users, and actions
 */
class CooldownManager {
  constructor() {
    this.cooldowns = new Map();
    
    // Cleanup expired cooldowns every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if action is on cooldown and set if not
   * @param {string} key - Unique identifier (e.g., 'diff:user:123456', 'spam:user:789')
   * @param {number} cooldownMs - Cooldown duration in milliseconds
   * @returns {number} - 0 if allowed, or seconds remaining on cooldown
   */
  check(key, cooldownMs) {
    const now = Date.now();
    const nextAvailable = this.cooldowns.get(key) || 0;
    
    if (now < nextAvailable) {
      const remaining = Math.ceil((nextAvailable - now) / 1000);
      logger.debug(`[COOLDOWN] Key "${key}" still on cooldown: ${remaining}s remaining`);
      return remaining;
    }
    
    this.cooldowns.set(key, now + cooldownMs);
    logger.debug(`[COOLDOWN] Set for "${key}" (${cooldownMs / 1000}s)`);
    return 0;
  }

  /**
   * Clear a specific cooldown
   * @param {string} key - Cooldown key to clear
   */
  clear(key) {
    const existed = this.cooldowns.has(key);
    this.cooldowns.delete(key);
    
    if (existed) {
      logger.debug(`[COOLDOWN] Cleared "${key}"`);
    }
  }

  /**
   * Check if key is currently on cooldown (without setting)
   * @param {string} key
   * @returns {boolean}
   */
  isOnCooldown(key) {
    const now = Date.now();
    const nextAvailable = this.cooldowns.get(key) || 0;
    return now < nextAvailable;
  }

  /**
   * Get remaining time on cooldown
   * @param {string} key
   * @returns {number} - Seconds remaining, or 0 if not on cooldown
   */
  getRemaining(key) {
    const now = Date.now();
    const nextAvailable = this.cooldowns.get(key) || 0;
    
    if (now < nextAvailable) {
      return Math.ceil((nextAvailable - now) / 1000);
    }
    
    return 0;
  }

  /**
   * Remove expired cooldowns
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, until] of this.cooldowns.entries()) {
      if (now > until) {
        this.cooldowns.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.debug(`[COOLDOWN] Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Get all active cooldowns (for debugging)
   */
  getActive() {
    const now = Date.now();
    const active = [];
    
    for (const [key, until] of this.cooldowns.entries()) {
      if (now < until) {
        active.push({
          key,
          remaining: Math.ceil((until - now) / 1000)
        });
      }
    }
    
    return active;
  }
}

module.exports = new CooldownManager();
