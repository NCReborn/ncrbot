const logger = require('./logger');
const versionCooldowns = new Map();

function checkCooldown(userId, cooldownTime) {
  const now = Date.now();
  const cooldownEndTime = versionCooldowns.get(userId) || 0;
  if (now < cooldownEndTime) {
    logger.info(`[VERSION] Cooldown hit for user ${userId} (${Math.ceil((cooldownEndTime - now) / 1000 / 60)} min left)`);
    return Math.ceil((cooldownEndTime - now) / 1000 / 60);
  }
  return 0;
}

function setCooldown(userId, cooldownTime) {
  versionCooldowns.set(userId, Date.now() + cooldownTime);
  logger.info(`[VERSION] Cooldown set for user ${userId} for ${cooldownTime / 60000} minutes`);
}

function cleanupOldCooldowns() {
  const currentTime = Date.now();
  for (const [key, endTime] of versionCooldowns.entries()) {
    if (currentTime > endTime) {
      versionCooldowns.delete(key);
      logger.info(`[VERSION] Cooldown expired for user ${key}`);
    }
  }
}

module.exports = {
  checkCooldown,
  setCooldown,
  cleanupOldCooldowns
};
