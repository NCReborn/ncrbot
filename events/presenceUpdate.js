// events/presenceUpdate.js

const userActivityTracker = require('../services/spam/UserActivityTracker');

module.exports = async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.user) return;

  const guildId = newPresence.guild.id;
  const userId = newPresence.user.id;

  // Presence change (offline → online)
  if (oldPresence?.status !== newPresence.status) {
    userActivityTracker.recordPresenceChange(guildId, userId);
  }

  // Device change (mobile → desktop → web)
  const oldClientStatus = oldPresence?.clientStatus || {};
  const newClientStatus = newPresence.clientStatus || {};

  if (JSON.stringify(oldClientStatus) !== JSON.stringify(newClientStatus)) {
    userActivityTracker.recordDeviceChange(guildId, userId);
  }
};
