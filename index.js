require('dotenv').config();
require('./utils/envCheck').checkEnv();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

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

let runtimeRegistrationFailed = false;
let loadedCount = 0;
let failedCount = 0;

for (const file of commandFiles) {
  try {
    const command = require(`./commands/${file}`);
    if (Array.isArray(command)) {
      for (const subcommand of command) {
        if (subcommand.data && typeof subcommand.execute === 'function') {
          client.commands.set(subcommand.data.name, subcommand);
          logger.info(`Loaded subcommand: ${subcommand.data.name}`);
          loadedCount++;
        } else {
          logger.error(`Subcommand in ${file} is missing .data or .execute`);
          runtimeRegistrationFailed = true;
          failedCount++;
        }
      }
    } else if (command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
      logger.info(`Loaded command: ${command.data.name}`);
      loadedCount++;
    } else {
      logger.error(`Command file ${file} does not export a valid command with .data and .execute`);
      runtimeRegistrationFailed = true;
      failedCount++;
    }
  } catch (err) {
    logger.error(`Failed to load command ${file}: ${err.message}`);
    runtimeRegistrationFailed = true;
    failedCount++;
  }
}

logger.info(`✨ Commands loaded: ${loadedCount} successful, ${failedCount} failed`);

if (runtimeRegistrationFailed) {
  logger.error('Aborting bot startup due to invalid/malformed commands. Check above logs for details.');
  logger.error('Command files found: ' + commandFiles.join(', '));
  process.exit(1);
}

// Load events from events/ directory
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

// Bot Control Panel: Repost control panel on startup if saved
const { postOrUpdateControlPanel } = require('./commands/botcontrol.js');
const { loadMessageInfo, clearMessageInfo } = require('./utils/botControlStatus');

client.once('clientReady', async () => {
  logger.info(`Ready! Logged in as ${client.user.tag}`);

  // Load saved message info
  const controlMsgInfo = loadMessageInfo();

  // Determine channel to use (only cares about the Bot Control Panel's last channel)
  const channelId = controlMsgInfo?.channelId;
  if (!channelId) return; // No known channel to restore to

  try {
    const channel = await client.channels.fetch(channelId);

    // Delete old Bot Control Panel message if it exists
    if (controlMsgInfo?.messageId) {
      try {
        const oldMsg = await channel.messages.fetch(controlMsgInfo.messageId);
        if (oldMsg) await oldMsg.delete();
      } catch (e) {/* Already deleted or missing */}
      clearMessageInfo();
    }

    // Only post the Bot Control Panel
    await postOrUpdateControlPanel(channel, client);

  } catch (e) {
    clearMessageInfo();
    logger.warn('Failed to restore bot control panel on startup; previous message/channel not found.');
  }
});

client.login(process.env.DISCORD_TOKEN);
