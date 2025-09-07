// Map channelId => lastUsed timestamp
const lastUsedMap = new Map();

/**
 * Checks if the cooldown has expired for the given key.
 * If expired, sets the new timestamp and returns 0.
 * If not expired, returns the seconds left.
 * @param {string|number} key - Unique key per channel (e.g. channelId)
 * @param {number} cooldownMs - Cooldown time in ms
 * @returns {number} - 0 if allowed, or seconds left on cooldown
 */
function checkAndSetCooldown(key, cooldownMs) {
  const now = Date.now();
  const lastUsed = lastUsedMap.get(key) || 0;
  if (now - lastUsed < cooldownMs) {
    return Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
  }
  lastUsedMap.set(key, now);
  return 0;
}

module.exports = { checkAndSetCooldown };
