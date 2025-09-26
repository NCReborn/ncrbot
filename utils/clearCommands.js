module.exports = async (client) => {
  await client.application.commands.set([]); // Removes all global commands
  // For guild-specific commands (uncomment and set your guild ID):
  // const guild = client.guilds.cache.get('YOUR_GUILD_ID');
  // await guild.commands.set([]); // Removes all guild commands
};
