const versionCooldowns = new Map();

function checkCooldown(userId, cooldownTime) {
  const now = Date.now();
  const cooldownEndTime = versionCooldowns.get(userId) || 0;
  
  if (now < cooldownEndTime) {
    return Math.ceil((cooldownEndTime - now) / 1000 / 60);
  }
  
  return 0;
}

function setCooldown(userId, cooldownTime) {
  versionCooldowns.set(userId, Date.now() + cooldownTime);
}

function cleanupOldCooldowns() {
  const currentTime = Date.now();
  for (const [key, endTime] of versionCooldowns.entries()) {
    if (currentTime > endTime) {
      versionCooldowns.delete(key);
    }
  }
}

module.exports = {
  checkCooldown,
  setCooldown,
  cleanupOldCooldowns
};
