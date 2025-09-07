// Map key => lastUsed timestamp
const lastUsedMap = new Map();

// Always use the same key format for status cooldowns: "status:channel:<channelId>"
function makeStatusKey(channelId) {
  return `status:channel:${channelId}`;
}

function cleanupOldCooldowns(cooldownMs = 10 * 60 * 1000) {
  // Remove entries older than cooldownMs (default: 10min)
  const now = Date.now();
  for (const [key, ts] of lastUsedMap.entries()) {
    if (now - ts > cooldownMs) lastUsedMap.delete(key);
  }
}

/**
 * Checks if the cooldown has expired for the given channel.
 * If expired, sets the new timestamp and returns 0.
 * If not expired, returns the seconds left.
 * @param {string|number} channelId - Voice channel id (or unique context)
 * @param {number} cooldownMs - Cooldown time in ms
 * @returns {number} - 0 if allowed, or seconds left on cooldown
 */
function checkAndSetCooldown(channelId, cooldownMs) {
  const key = makeStatusKey(channelId);
  const now = Date.now();
  const lastUsed = lastUsedMap.get(key) || 0;
  if (now - lastUsed < cooldownMs) {
    return Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
  }
  lastUsedMap.set(key, now);
  return 0;
}

// Performance: Periodically clean up old cooldowns
setInterval(() => cleanupOldCooldowns(), 10 * 60 * 1000); // every 10 minutes

module.exports = { checkAndSetCooldown };
