const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getConfiguredGuildIds } = require('./guildConfig');
require('dotenv').config();
require('./envCheck').checkEnv();

async function syncSlashCommands() {
  const guildIds = getConfiguredGuildIds();
  if (guildIds.length === 0) {
    logger.error('[COMMAND_SYNC] No guild IDs configured. Set GUILD_IDS (preferred) or GUILD_ID.');
    throw new Error('Missing guild configuration for command sync.');
  }

  const commands = [];
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  let registrationFailed = false;

  for (const file of commandFiles) {
    try {
      const command = require(`${commandsPath}/${file}`);
      if (Array.isArray(command)) {
        for (const subcommand of command) {
          if (subcommand.data && typeof subcommand.data.toJSON === 'function') {
            commands.push(subcommand.data.toJSON());
            logger.info(`Prepared subcommand: ${subcommand.data.name}`);
          } else {
            logger.error(`Subcommand in ${file} is missing .data or .data.toJSON()`);
            registrationFailed = true;
          }
        }
      } else if (command.data && typeof command.data.toJSON === 'function') {
        commands.push(command.data.toJSON());
        logger.info(`Prepared command: ${command.data.name}`);
      } else {
        logger.error(`Command file ${file} does not export a valid command with .data.toJSON()`);
        registrationFailed = true;
      }
    } catch (err) {
      logger.error(`Failed to load command ${file}: ${err.message}`);
      registrationFailed = true;
    }
  }

  if (registrationFailed) {
    logger.error('Aborting slash command registration due to invalid/malformed commands.');
    throw new Error('Malformed command(s) present. See logs above.');
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  // Register commands to ALL guilds
  for (const GUILD_ID of guildIds) {
    logger.info(`Registering ${commands.length} application (/) commands for guild ${GUILD_ID}:`);
    commands.forEach(cmd => logger.info(`   - ${cmd.name}`));

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),  // ✅ FIXED
      { body: commands },
    );

    logger.info(`✅ Successfully reloaded application (/) commands for guild ${GUILD_ID}.`);
  }

  logger.info(`✅ Command sync complete for ${guildIds.length} guild(s).`);
}

module.exports = { syncSlashCommands };
