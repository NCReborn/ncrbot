const { Events } = require("discord.js");
const guildProfiles = require("./botProfileConfig");

async function applyProfileForGuild(guild) {
  const profile = guildProfiles[guild.id];
  if (!profile) return;

  const me = guild.members.me ?? await guild.members.fetchMe();

  // Set per-guild nickname
  if (typeof profile.nickname === "string" && me.nickname !== profile.nickname) {
    try {
      await me.setNickname(profile.nickname, "Applying per-guild bot profile config");
      console.log(`[Profile] ${guild.name}: nickname -> ${profile.nickname}`);
    } catch (error) {
      console.error(`[Profile] ${guild.name}: failed to set nickname`, error.message);
    }
  }

  // Set per-guild avatar (if supported for your bot setup)
  if (typeof profile.avatar === "string") {
    try {
      await me.setAvatar(profile.avatar);
      console.log(`[Profile] ${guild.name}: avatar updated`);
    } catch (error) {
      console.error(`[Profile] ${guild.name}: failed to set avatar`, error.message);
    }
  }
}

module.exports = function setupGuildProfiles(client) {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      await applyProfileForGuild(guild);
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    await applyProfileForGuild(guild);
  });
};
