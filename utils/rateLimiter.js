const logger = require('./logger');
const cooldowns = new Map();

/**
 * Checks if a key (user, command, channel, or composite) is rate limited,
 * and if not, sets the cooldown.
 * @param {string} key - Unique key for the action (e.g. `${userId}:diff`, `diff:global`)
 * @param {number} cooldownMs - Cooldown time in ms
 * @returns {number} - 0 if allowed, or seconds left on cooldown
 */
function checkAndSetRateLimit(key, cooldownMs) {
  const now = Date.now();
  const nextAvailable = cooldowns.get(key) || 0;
  if (now < nextAvailable) {
    return Math.ceil((nextAvailable - now) / 1000);
  }
  cooldowns.set(key, now + cooldownMs);
  logger.info(`Rate limit set for key "${key}" for ${cooldownMs / 1000}s`);
  return 0;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, until] of cooldowns.entries()) {
    if (now > until) cooldowns.delete(key);
  }
}

// Performance: Clean up expired rate limits every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

module.exports = { checkAndSetRateLimit, cleanupExpired };
