require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleVersionCommand } = require('./commands/version');
const { handleDiffCommand } = require('./commands/diff');
const { startCrashLogMonitor } = require('./services/crashLogService');
const { BOT_TOKEN } = require('./config/constants');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  startCrashLogMonitor(client);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Support both !version and !versions as aliases
  if (
    message.content.startsWith('!version') ||
    message.content.startsWith('!versions')
  ) {
    await handleVersionCommand(message);
    return;
  }

  if (message.content.startsWith('!diff')) {
    await handleDiffCommand(message);
    return;
  }
});

client.login(BOT_TOKEN);
