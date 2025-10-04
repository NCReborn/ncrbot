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
process.on('unhandledRejection', (reason, promise) => {
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

const BOT_TOKEN = process.env.DISCORD_TOKEN;

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
for (const file of commandFiles) {
  try {
    const command = require(`./commands/${file}`);
    if (Array.isArray(command)) {
      for (const subcommand of command) {
        if (subcommand.data && typeof subcommand.execute === 'function') {
          client.commands.set(subcommand.data.name, subcommand);
          logger.info(`Loaded subcommand: ${subcommand.data.name}`);
        } else {
          logger.error(`Subcommand in ${file} is missing .data or .execute`);
          runtimeRegistrationFailed = true;
        }
      }
    } else if (command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
      logger.info(`Loaded command: ${command.data.name}`);
    } else {
      logger.error(`Command file ${file} does not export a valid command with .data and .execute`);
      runtimeRegistrationFailed = true;
    }
  } catch (err) {
    logger.error(`Failed to load command ${file}: ${err.message}`);
    runtimeRegistrationFailed = true;
  }
}
if (runtimeRegistrationFailed) {
  logger.error('Aborting bot startup due to invalid/malformed commands. Check above logs for details.');
  logger.error('Command files found: ' + commandFiles.join(', '));
  process.exit(1);
}

// --- LOAD EVENTS FROM events/ DIRECTORY ---
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

// --- CLEAR DUPLICATE SLASH COMMANDS ONCE (REMOVE OR COMMENT AFTER RUNNING ONCE) ---
// Uncomment next lines to clear all global and guild commands.
// const clearCommands = require('./utils/clearCommands');
// client.once('clientReady', async () => {
//   logger.info(`Ready! Logged in as ${client.user.tag}`);
//   await clearCommands(client);
//   logger.info('All global and guild commands cleared. Remove or comment this after running once.');
// });

// --- Bot Control Panel: Repost control panel on startup if saved ---
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

// --- SNAPSMITH MODULE IMPORTS ---
const snapsmithTracker = require('./modules/snapsmith/tracker');
const snapsmithRoles = require('./modules/snapsmith/Roles');
const snapsmithSuperApproval = require('./modules/snapsmith/superApproval');
const snapsmithAnnouncer = require('./modules/snapsmith/announcer');

// --- SHOWCASE POST DETECTION ---
client.on('messageCreate', async (message) => {
  // Only act on non-bot messages in the showcase channel
  if (
    message.channel.id === snapsmithAnnouncer.SHOWCASE_CHANNEL_ID &&
    !message.author.bot
  ) {
    // Track the showcase post
    snapsmithTracker.trackShowcasePost(message);

    // Auto-react with emojis (these do NOT count)
    await message.react('👍').catch(() => {});
    await message.react('🔥').catch(() => {});
    await message.react('😎').catch(() => {});
    // Add more emojis if desired
  }
});

// --- REACTION HANDLING ---
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  // Only process reactions in the showcase channel
  if (reaction.message.channel.id !== snapsmithAnnouncer.SHOWCASE_CHANNEL_ID) return;

  // Track unique reactor
  snapsmithTracker.addReaction(reaction.message.id, user.id);

  // Check for super approval
  const result = await snapsmithSuperApproval.processSuperApproval(
    reaction.message, reaction, user, reaction.message.guild
  );

  if (result === 'granted') {
    await snapsmithAnnouncer.announceNewSnapsmith(client, reaction.message.author.id, user.id);
  } else if (result === 'bonus') {
    await snapsmithAnnouncer.announceSuperApproval(client, reaction.message.author.id, user.id);
  }

  // Milestone check (extra days for reactions)
  const authorId = reaction.message.author.id;
  const stats = snapsmithTracker.getUserReactionStats(authorId);
  const userStatus = snapsmithRoles.getSnapsmithStatus(authorId);
  const prevMilestone = userStatus.prevMilestone || 0; // Store prevMilestone in user meta
  const milestone = Math.floor((stats.total - 30) / snapsmithRoles.EXTRA_DAY_REACTION_COUNT);

  if (userStatus.isActive && milestone > prevMilestone) {
    snapsmithRoles.addSnapsmithDays(authorId, milestone - prevMilestone);
    await snapsmithAnnouncer.announceExtraDay(client, authorId, milestone - prevMilestone);
    // TODO: update prevMilestone in user meta
  }
});

// --- PERIODIC DECAY & EXPIRY ---
setInterval(() => {
  snapsmithTracker.applyDecay();
  const guild = client.guilds.cache.get(process.env.GUILD_ID); // Set your guild ID in .env
  if (guild) snapsmithRoles.expireSnapsmiths(guild);
}, 24 * 60 * 60 * 1000); // Every 24 hours

// --- DO NOT HANDLE SLASH COMMANDS HERE ---
// All slash command handling is now in events/interactionCreate.js

client.login(BOT_TOKEN);
