require('dotenv').config();
const { Client, GatewayIntentBits, Collection, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Import log analysis utilities (only ONCE!)
const { fetchLogAttachment, analyzeLogForErrors, buildErrorEmbed } = require('./utils/logAnalyzer');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Set your crash log channel ID (replace with actual ID or use env)
const CRASH_LOG_CHANNEL_ID = process.env.CRASH_LOG_CHANNEL_ID || '1411831110417252493';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Load slash commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
    }
  }
});

// Crash log auto-analysis handler
client.on('messageCreate', async (message) => {
  // Only handle new messages in the crash log channel, from users, with attachments
  if (
    message.channelId !== CRASH_LOG_CHANNEL_ID ||
    message.author.bot ||
    message.attachments.size === 0
  ) return;

  for (const [, attachment] of message.attachments) {
    const logContent = await fetchLogAttachment(attachment);
    if (!logContent) continue;

    const errorMatches = analyzeLogForErrors(logContent);

    // Always reply with the embed (even if no errors)
    const embed = buildErrorEmbed(attachment, errorMatches, logContent, message.url);
    await message.reply({ embeds: [embed] });

    // React for visual clarity
    if (errorMatches.length > 0) {
      await message.react('❌');
    } else {
      await message.react('✅');
    }
  }
});
const { fetchRevision } = require('./utils/nexusApi');
const { updateCollectionVersionChannel, updateStatusChannel } = require('./utils/voiceChannelUpdater');
const { setRevision, getRevision, getRevertAt, saveState, loadState } = require('./utils/revisionStore');
const voiceConfig = require('./config/voiceChannels');

const POLL_INTERVAL = 10 * 60 * 1000; // 10 min
const COLLECTION_SLUG = 'rcuccp'; // Use your collection's slug

client.once('ready', async () => {
  console.log('Bot ready - starting revision poller');
  const guild = client.guilds.cache.first(); // or get by ID if needed

  // On startup, check if a revert is scheduled
  const revertAt = getRevertAt();
  if (revertAt && Date.now() < revertAt) {
    const timeLeft = revertAt - Date.now();
    setTimeout(async () => {
      await updateStatusChannel(guild, voiceConfig.statusStable);
      setRevision(getRevision(), null);
    }, timeLeft);
    // Optionally log scheduled revert
    console.log(`Scheduled status revert in ${Math.round(timeLeft/1000/60)}min`);
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
      const lastRevision = getRevision();

      if (!lastRevision || currentRevision > lastRevision) {
        // Detected new revision!
        await updateCollectionVersionChannel(guild, currentRevision);
        await updateStatusChannel(guild, voiceConfig.statusChecking);

        // Schedule the revert to "Stable" in 24h
        const revertAt = Date.now() + 24 * 60 * 60 * 1000;
        setRevision(currentRevision, revertAt);
        setTimeout(async () => {
          await updateStatusChannel(guild, voiceConfig.statusStable);
          setRevision(currentRevision, null);
        }, 24 * 60 * 60 * 1000);

        console.log(`Detected new revision: ${currentRevision}, status set to Checking, will revert to Stable in 24h`);
      }
    } catch (err) {
      console.error('Revision polling error:', err);
    }
  }, POLL_INTERVAL);
});

client.login(BOT_TOKEN);
