const versionCooldowns = new Map();

module.exports = {
  checkCooldown: (key) => versionCooldowns.get(key) || 0,
  
  setCooldown: (key, endTime) => versionCooldowns.set(key, endTime),
  
  cleanupCooldowns: () => {
    if (Math.random() < 0.1) {
      const currentTime = Date.now();
      for (const [key, endTime] of versionCooldowns.entries()) {
        if (currentTime > endTime) {
          versionCooldowns.delete(key);
        }
      }
    }
  }
};