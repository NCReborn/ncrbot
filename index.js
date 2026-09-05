require('dotenv').config();
require('./utils/envCheck').checkEnv();

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { logMissingRequiredGuildChannelMappings } = require('./utils/guildConfig');
const { installProcessErrorHandlers, startRuntimeMonitor } = require('./utils/runtimeMonitor');

// Install global error handlers
installProcessErrorHandlers(logger);

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

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
    Partials.User,
  ],
});

// Handlers
require('./utils/imageOnlyHandler')(client);
require('./utils/welcomeHandler')(client);

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

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = getAllCommandFiles(commandsPath);

let runtimeRegistrationFailed = false;
let loadedCount = 0;
let failedCount = 0;

for (const fullPath of commandFiles) {
  try {
    const command = require(fullPath);

    if (Array.isArray(command)) {
      for (const subcommand of command) {
        if (subcommand.data && typeof subcommand.execute === 'function') {
          client.commands.set(subcommand.data.name, subcommand);
          logger.info(`Loaded subcommand: ${subcommand.data.name}`);
          loadedCount++;
        } else {
          logger.error(`Subcommand in ${fullPath} is missing .data or .execute`);
          runtimeRegistrationFailed = true;
          failedCount++;
        }
      }
    } else if (command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
      logger.info(`Loaded command: ${command.data.name}`);
      loadedCount++;
    } else {
      logger.error(`Command file ${fullPath} does not export a valid command with .data and .execute`);
      runtimeRegistrationFailed = true;
      failedCount++;
    }
  } catch (err) {
    logger.error(`Failed to load command ${fullPath}: ${err.message}`);
    runtimeRegistrationFailed = true;
    failedCount++;
  }
}

logger.info(`✨ Commands loaded: ${loadedCount} successful, ${failedCount} failed`);

if (runtimeRegistrationFailed) {
  logger.error('Aborting bot startup due to invalid/malformed commands.');
  process.exit(1);
}

// Load events (flat — safe to subfolder later if you want)
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

// Remove deprecated ready event — now handled in ready.js
client.once('clientReady', () => {
  logMissingRequiredGuildChannelMappings(client);
});

// Start runtime monitor
// startRuntimeMonitor(client, logger);

// Login
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  logger.error('[DISCORD] Failed to login', { error });
  process.exit(1);
});
