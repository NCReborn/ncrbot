const logger = require('./logger');
const versionCooldowns = new Map();

// Always use the same key format for user cooldowns: "version:user:<userId>"
function makeVersionKey(userId) {
  return `version:user:${userId}`;
}

function checkCooldown(userId, cooldownTime) {
  const key = makeVersionKey(userId);
  const now = Date.now();
  const cooldownEndTime = versionCooldowns.get(key) || 0;
  if (now < cooldownEndTime) {
    logger.info(`[VERSION] Cooldown hit for user ${userId} (${Math.ceil((cooldownEndTime - now) / 1000 / 60)} min left)`);
    return Math.ceil((cooldownEndTime - now) / 1000 / 60);
  }
  return 0;
}

function setCooldown(userId, cooldownTime) {
  const key = makeVersionKey(userId);
  versionCooldowns.set(key, Date.now() + cooldownTime);
  logger.info(`[VERSION] Cooldown set for user ${userId} for ${cooldownTime / 60000} minutes`);
}

function cleanupOldCooldowns() {
  const currentTime = Date.now();
  for (const [key, endTime] of versionCooldowns.entries()) {
    if (currentTime > endTime) {
      versionCooldowns.delete(key);
      logger.info(`[VERSION] Cooldown expired for ${key}`);
    }
  }
}

// Performance: Periodically clean up expired cooldowns to avoid unbounded memory growth
setInterval(cleanupOldCooldowns, 10 * 60 * 1000); // every 10 minutes

module.exports = {
  checkCooldown,
  setCooldown,
  cleanupOldCooldowns
};
