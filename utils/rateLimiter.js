const logger = require('./logger');

const cooldowns = new Map();

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

module.exports = { checkAndSetRateLimit, cleanupExpired };
