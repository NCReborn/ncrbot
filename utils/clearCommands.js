module.exports = async (client) => {
  await client.application.commands.set([]); // Removes all global commands
  // For guild-specific commands (uncomment and set your guild ID):
  const guild = client.guilds.cache.get('1285796904160202752');
  // await guild.commands.set([]); // Removes all guild commands
};
