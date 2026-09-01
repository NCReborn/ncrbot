const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getConfiguredGuildIds } = require('./guildConfig');
require('dotenv').config();
require('./envCheck').checkEnv();

// --- Recursive command loader ---
function getAllCommandFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(getAllCommandFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

async function syncSlashCommands() {
  const guildIds = getConfiguredGuildIds();
  if (guildIds.length === 0) {
    logger.error('[COMMAND_SYNC] No guild IDs configured. Set GUILD_IDS (preferred) or GUILD_ID.');
    throw new Error('Missing guild configuration for command sync.');
  }

  const commands = [];
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = getAllCommandFiles(commandsPath);

  let registrationFailed = false;

  for (const fullPath of commandFiles) {
    try {
      const command = require(fullPath);

      if (Array.isArray(command)) {
        for (const subcommand of command) {
          if (subcommand.data && typeof subcommand.data.toJSON === 'function') {
            commands.push(subcommand.data.toJSON());
            logger.info(`Prepared subcommand: ${subcommand.data.name}`);
          } else {
            logger.error(`Subcommand in ${fullPath} is missing .data or .data.toJSON()`);
            registrationFailed = true;
          }
        }
      } else if (command.data && typeof command.data.toJSON === 'function') {
        commands.push(command.data.toJSON());
        logger.info(`Prepared command: ${command.data.name}`);
      } else {
        logger.error(`Command file ${fullPath} does not export a valid command with .data.toJSON()`);
        registrationFailed = true;
      }
    } catch (err) {
      logger.error(`Failed to load command ${fullPath}: ${err.message}`);
      registrationFailed = true;
    }
  }

  if (registrationFailed) {
    logger.error('Aborting slash command registration due to invalid/malformed commands.');
    throw new Error('Malformed command(s) present.');
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  // Register commands to ALL guilds
  for (const GUILD_ID of guildIds) {
    logger.info(`Registering ${commands.length} application (/) commands for guild ${GUILD_ID}:`);
    commands.forEach(cmd => logger.info(`   - ${cmd.name}`));

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    logger.info(`✅ Successfully reloaded application (/) commands for guild ${GUILD_ID}.`);
  }

  logger.info(`✅ Command sync complete for ${guildIds.length} guild(s).`);
}

module.exports = { syncSlashCommands };
