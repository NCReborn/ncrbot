const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function reloadCommands(client, logger) {
  client.commands.clear();

  const commandsPath = path.join(__dirname, '.');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  let loaded = 0;
  let failed = 0;
  const commandsForDiscord = [];

  for (const file of commandFiles) {
    if (file === 'reload.js') continue;
    try {
      delete require.cache[require.resolve(`./${file}`)];
      const command = require(`./${file}`);
      if (Array.isArray(command)) {
        for (const subcommand of command) {
          if (subcommand.data && typeof subcommand.execute === 'function') {
            client.commands.set(subcommand.data.name, subcommand);
            if (typeof subcommand.data.toJSON === 'function') {
              commandsForDiscord.push(subcommand.data.toJSON());
            } else if (typeof subcommand.data === 'object') {
              commandsForDiscord.push(subcommand.data);
            }
            loaded++;
          } else {
            logger.error(`[RELOAD] Subcommand in ${file} is missing .data or .execute`);
            failed++;
          }
        }
      } else if (command.data && typeof command.execute === 'function') {
        client.commands.set(command.data.name, command);
        if (typeof command.data.toJSON === 'function') {
          commandsForDiscord.push(command.data.toJSON());
        } else if (typeof command.data === 'object') {
          commandsForDiscord.push(command.data);
        }
        loaded++;
      } else {
        logger.error(`[RELOAD] Command file ${file} is missing .data or .execute`);
        failed++;
      }
    } catch (err) {
      logger.error(`[RELOAD] Failed to reload command ${file}: ${err.message}`);
      failed++;
    }
  }

  // Register slash commands with Discord
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const CLIENT_ID = process.env.CLIENT_ID;
    const GUILD_ID = process.env.GUILD_ID;

    if (!CLIENT_ID || !GUILD_ID) {
      logger.warn('CLIENT_ID or GUILD_ID is not set, skipping Discord application command registration.');
    } else {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commandsForDiscord }
      );
      logger.info(`[RELOAD] Application commands registered for guild ${GUILD_ID}`);
    }
  } catch (err) {
    logger.error(`[RELOAD] Failed to register application commands with Discord: ${err.message}`);
  }

  logger.info(`[RELOAD] Slash commands reloaded by button press. Loaded: ${loaded} Failed: ${failed}`);
}

module.exports = {
  data: {
    name: 'reload',
    description: 'Reload all bot commands',
  },
  async execute(interaction) {
    await reloadCommands(interaction.client, require('../utils/logger'));
    await interaction.reply({ content: 'Slash commands reloaded!', ephemeral: true });
  },
  reloadCommands,
};
