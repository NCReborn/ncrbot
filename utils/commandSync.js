const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
require('dotenv').config();
require('./envCheck').checkEnv();

const GUILD_ID = process.env.GUILD_ID || '1285796904160202752';

async function syncSlashCommands() {
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

  logger.info(`Registering ${commands.length} application (/) commands for guild ${GUILD_ID}:`);
  commands.forEach(cmd => logger.info(`   - ${cmd.name}`));

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
    { body: commands },
  );

  logger.info('Successfully reloaded application (/) commands for guild.');
}

module.exports = { syncSlashCommands };
