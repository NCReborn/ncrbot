const fs = require('fs');
const path = require('path');
const DATA_PATH = path.resolve(__dirname, '../data/snapsmith.json');
const SNAPSMITH_ROLE_ID = '1374841261898469378';

function loadTimers() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveTimers(timers) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(timers, null, 2));
}

// Scheduled task: call this once on bot startup
function startExpiryCheck(client) {
  setInterval(async () => {
    const now = Date.now();
    let timers = loadTimers();
    let changed = false;

    for (const [userId, expiry] of Object.entries(timers)) {
      if (expiry < now) {
        // Remove role if expired
        try {
          const guild = client.guilds.cache.first(); // or fetch by ID if you have multiple guilds
          const member = await guild.members.fetch(userId);
          await member.roles.remove(SNAPSMITH_ROLE_ID);
        } catch (err) {
          console.error(`Failed to remove SnapSmith role from ${userId}:`, err);
        }

        delete timers[userId];
        changed = true;
      }
    }

    if (changed) saveTimers(timers);
  }, 60 * 60 * 1000); // Checks every hour
}

module.exports = { startExpiryCheck };
