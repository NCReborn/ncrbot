require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleVersionCommand } = require('./commands/version');
const { handleDiffCommand } = require('./commands/diff');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const API_KEY = process.env.NEXUS_API_KEY;
const APP_NAME = process.env.APP_NAME || 'CollectionDiffBot';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  if (message.content.startsWith('!version')) {
    await handleVersionCommand(message);
    return;
  }
  
  if (message.content.startsWith('!diff')) {
    const args = message.content.split(/\s+/);
    await handleDiffCommand(message, args, API_KEY, APP_NAME, APP_VERSION);
    return;
  }
});

client.login(BOT_TOKEN);
