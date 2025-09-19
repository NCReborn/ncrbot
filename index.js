require('dotenv').config();
require('./utils/envCheck').checkEnv();

const { Client, GatewayIntentBits, Collection, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('./utils/logger');

// FAQ system: load store on boot
const { loadFAQs } = require('./faq/store');
loadFAQs();

// FAQ system: register event handler
const { onMessageCreate: faqOnMessageCreate } = require('./events/messageCreate');

// Handle uncaught exceptions (fail fast, log for diagnostics)
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.stack || err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason instanceof Error ? reason.stack : reason);
});

// Graceful shutdown on SIGINT/SIGTERM
process.on('SIGINT', () => {
  logger.info('Bot interrupted (SIGINT). Shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('Bot terminated (SIGTERM). Shutting down...');
  process.exit(0);
});

// Auto-sync slash commands on startup if enabled in .env
if (process.env.AUTO_SYNC_COMMANDS === 'true') {
  const { syncSlashCommands } = require('./utils/commandSync');
  syncSlashCommands()
    .then(() => logger.info('Slash commands auto-synced on startup.'))
    .catch(e => {
      logger.error('Slash sync failed:', e);
      process.exit(1);
    });
}

// Import log analysis utilities
const { fetchLogAttachment, analyzeLogForErrors, buildErrorEmbed } = require('./utils/logAnalyzer');
const { sendLogScanButton, handleLogScanTicketInteraction } = require('./utils/logScanTicket');

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const CRASH_LOG_CHANNEL_ID = process.env.CRASH_LOG_CHANNEL_ID || '1287876503811653785';
const LOG_SCAN_CHANNEL_ID = process.env.LOG_SCAN_CHANNEL_ID || '1414027269680267274';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Load slash commands with validation and logging
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
  logger.error('Aborting bot startup due to invalid/malformed commands.');
  process.exit(1);
}

// Combined ready handler: send log scan button and start revision poller
client.once('ready', async () => {
  logger.info(`Logged in as ${client.user.tag}`);
  logger.info(`Loaded ${client.commands.size} commands.`);
  logger.info(`Crash log channel: ${CRASH_LOG_CHANNEL_ID}, Log scan channel: ${LOG_SCAN_CHANNEL_ID}`);
  logger.info(`Revision polling enabled: ${!!process.env.NEXUS_API_KEY}`);
  client.user.setActivity('/help for commands', { type: 'LISTENING' });

  try {
    await sendLogScanButton(client, LOG_SCAN_CHANNEL_ID);
  } catch (err) {
    logger.error(`Error sending log scan button: ${err.stack || err}`);
  }

  logger.info('Bot ready - starting revision poller');
  const guild = client.guilds.cache.first();

  // --- Revision polling logic ---
  const { fetchRevision } = require('./utils/nexusApi');
  const { updateCollectionVersionChannel, updateStatusChannel } = require('./utils/voiceChannelUpdater');
  const { setRevision, getRevision, getRevertAt } = require('./utils/revisionStore');
  const voiceConfig = require('./config/voiceChannels');

  const POLL_INTERVAL = 60 * 1000;
  const COLLECTION_SLUG = 'rcuccp';

  const revertAt = await getRevertAt();
  if (revertAt && Date.now() < revertAt) {
    const timeLeft = revertAt - Date.now();
    setTimeout(async () => {
      await updateStatusChannel(guild, voiceConfig.statusStable);
      await setRevision(await getRevision(), null);
    }, timeLeft);
    logger.info(`Scheduled status revert in ${Math.round(timeLeft / 1000 / 60)}min`);
  }

  setInterval(async () => {
    try {
      const revisionData = await fetchRevision(
        COLLECTION_SLUG,
        null,
        process.env.NEXUS_API_KEY,
        process.env.APP_NAME,
        process.env.APP_VERSION
      );
      const currentRevision = revisionData.revisionNumber;
      const lastRevision = await getRevision();

      if (!lastRevision || currentRevision > lastRevision) {
        await updateCollectionVersionChannel(guild, currentRevision);
        await updateStatusChannel(guild, voiceConfig.statusChecking);

        const revertAt = Date.now() + 24 * 60 * 60 * 1000;
        await setRevision(currentRevision, revertAt);
        setTimeout(async () => {
          await updateStatusChannel(guild, voiceConfig.statusStable);
          await setRevision(currentRevision, null);
        }, 24 * 60 * 60 * 1000);

        logger.info(`Detected new revision: ${currentRevision}, status set to Checking, will revert to Stable in 24h`);
      }
    } catch (err) {
      logger.error('Revision polling error:', err);
    }
  }, POLL_INTERVAL);
});

// --- FAQ SYSTEM: register message handler ---
client.on('messageCreate', faqOnMessageCreate);

// Handle ticket-style log scan (button + modal)
client.on('interactionCreate', async interaction => {
  try {
    await handleLogScanTicketInteraction(interaction);

    // Slash command handler
    if (interaction.type === InteractionType.ApplicationCommand) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error(error.stack || error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
      }
    }
  } catch (err) {
    logger.error(`[INTERACTION_CREATE] Uncaught error: ${err.stack || err}`);
    if (interaction && interaction.isRepliable && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: 'An unexpected error occurred processing your request.', ephemeral: true });
      } catch(e) {
        logger.error(`[INTERACTION_CREATE] Failed to reply to interaction: ${e.stack || e}`);
      }
    }
  }
});

// (Optional) If you want to keep file upload log analysis, leave this in. Otherwise, remove!
client.on('messageCreate', async (message) => {
  try {
    if (
      message.channelId !== CRASH_LOG_CHANNEL_ID ||
      message.author.bot ||
      message.attachments.size === 0
    ) return;

    for (const [, attachment] of message.attachments) {
      const logContent = await fetchLogAttachment(attachment);
      if (!logContent) continue;

      const analysisResult = await analyzeLogForErrors(logContent);

      const embed = buildErrorEmbed(attachment, analysisResult, logContent, message.url);
      await message.reply({ embeds: [embed] });

      if (analysisResult.matches.length > 0) {
        await message.react('❌');
      } else {
        await message.react('✅');
      }
    }
  } catch (err) {
    logger.error(`[MESSAGE_CREATE] Uncaught error: ${err.stack || err}`);
  }
});

client.login(BOT_TOKEN);
