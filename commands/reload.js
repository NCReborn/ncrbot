const fs = require('fs');
const path = require('path');

/**
 * Reloads all bot commands by clearing the require cache and re-requiring them
 */
async function reloadCommands(client, logger) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  // Clear the command collection
  client.commands.clear();

  // Clear require cache for command files
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    delete require.cache[require.resolve(filePath)];
  }

  // Reload commands
  let loadedCount = 0;
  for (const file of commandFiles) {
    try {
      const command = require(`../commands/${file}`);
      if (Array.isArray(command)) {
        for (const subcommand of command) {
          if (subcommand.data && typeof subcommand.execute === 'function') {
            client.commands.set(subcommand.data.name, subcommand);
            loadedCount++;
          }
        }
      } else if (command.data && typeof command.execute === 'function') {
        client.commands.set(command.data.name, command);
        loadedCount++;
      }
    } catch (err) {
      logger.error(`Failed to reload command ${file}: ${err.message}`);
      throw err;
    }
  }

  logger.info(`Reloaded ${loadedCount} commands`);
  return loadedCount;
}

module.exports = {
  reloadCommands
};
