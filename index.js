require('dotenv').config();
require('./utils/envCheck').checkEnv();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { logMissingRequiredGuildChannelMappings } = require('./utils/guildConfig');

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
  try { logger.error('Uncaught Exception:', err && err.stack ? err.stack : err); } catch(e) {}
  process.exit(1);
});
process.on('unhandledRejection', (reason, _promise) => {
  console.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
  try { logger.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason); } catch(e) {}
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Bot interrupted (SIGINT). Shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('Bot terminated (SIGTERM). Shutting down...');
  process.exit(0);
});

// Auto-sync slash commands if enabled
if (process.env.AUTO_SYNC_COMMANDS === 'true') {
  const { syncSlashCommands } = require('./utils/commandSync');
  syncSlashCommands()
    .then(() => logger.info('Slash commands auto-synced on startup.'))
    .catch(e => {
      logger.error('Slash sync failed:', e);
      process.exit(1);
    });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const imageOnlyHandler = require('./utils/imageOnlyHandler');
imageOnlyHandler(client);
require('./utils/welcomeHandler')(client);

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

let loadedCount = 0;
let failedCount = 0;

for (const file of commandFiles) {
  console.log(`\n[DEBUG] Attempting to load command file: ${file}`);

  try {
    const command = require(`./commands/${file}`);

    console.log(`[DEBUG] Successfully required: ${file}`);

    if (Array.isArray(command)) {
      for (const subcommand of command) {
        if (subcommand.data && typeof subcommand.execute === 'function') {
          client.commands.set(subcommand.data.name, subcommand);
          logger.info(`Loaded subcommand: ${subcommand.data.name}`);
          loadedCount++;
        } else {
          console.error(`[DEBUG] INVALID SUBCOMMAND STRUCTURE in ${file}`);
          failedCount++;
        }
      }
    } else if (command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
      logger.info(`Loaded command: ${command.data.name}`);
      loadedCount++;
    } else {
      console.error(`[DEBUG] INVALID COMMAND STRUCTURE in ${file}`);
      failedCount++;
    }

  } catch (err) {
    console.error(`\n[DEBUG] ERROR LOADING COMMAND FILE: ${file}`);
    console.error(`[DEBUG] ERROR MESSAGE: ${err.message}`);
    console.error(`[DEBUG] STACK TRACE:\n${err.stack}\n`);

    // STOP HERE — this forces Node to reveal the real broken file
    throw err;
  }
}

logger.info(`✨ Commands loaded: ${loadedCount} successful, ${failedCount} failed`);

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

logger.info(`✨ Events loaded successfully`);

client.once('ready', () => {
  logger.info(`Ready! Logged in as ${client.user.tag}`);
  logMissingRequiredGuildChannelMappings(client);
});

client.login(process.env.DISCORD_TOKEN);
