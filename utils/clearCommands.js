module.exports = async (client) => {
  // Remove global commands
  await client.application.commands.set([]);
  // Remove guild commands for all guilds the bot is in
  for (const [guildId, guild] of client.guilds.cache) {
    await guild.commands.set([]);
  }
};
