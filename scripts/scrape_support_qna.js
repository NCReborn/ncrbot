const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs').promises;

// CONFIGURE THESE!
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN; // or paste your token here
const SUPPORT_CHANNEL_ID = '1285796905640788030';
const STAFF_USER_IDS = [
  '1285798792842575882', // V
  '1324783261439889439', //Techie
  '1370874936456908931', //Fixer
  '1288633895910375464', //Ripperdoc
  // ...
];

const OUTPUT_FILE = './data/support_qna.json';
const MAX_MESSAGES = 10000;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

async function scrapeQnA() {
  await client.login(BOT_TOKEN);
  const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);

  let allMessages = [];
  let lastId = undefined;
  let totalFetched = 0;

  // Fetch all messages (in batches of 100)
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;
    allMessages = allMessages.concat(Array.from(messages.values()));
    totalFetched += messages.size;
    lastId = messages.last().id;
    if (totalFetched >= MAX_MESSAGES) break;
    await new Promise(res => setTimeout(res, 500)); // Throttle to avoid rate limits
  }

  // Sort by timestamp oldest -> newest
  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Build a mapping from message ID to message object for fast lookup
  const msgIdMap = {};
  allMessages.forEach(msg => {
    msgIdMap[msg.id] = msg;
  });

  // Find Q&A pairs: staff reply (using Discord reply) to a non-staff message
  let qnaPairs = [];
  for (const msg of allMessages) {
    if (
      STAFF_USER_IDS.includes(msg.author.id) &&
      msg.reference &&
      msg.reference.messageId &&
      msgIdMap[msg.reference.messageId]
    ) {
      const refMsg = msgIdMap[msg.reference.messageId];
      if (!STAFF_USER_IDS.includes(refMsg.author.id)) {
        qnaPairs.push({
          question: refMsg.content,
          question_user: refMsg.author.username,
          question_id: refMsg.id,
          question_time: refMsg.createdAt,
          answer: msg.content,
          answer_user: msg.author.username,
          answer_id: msg.id,
          answer_time: msg.createdAt,
        });
      }
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(qnaPairs, null, 2), 'utf-8');
  console.log(`Scraped ${qnaPairs.length} Q&A pairs (only reply-based).`);
  process.exit(0);
}

scrapeQnA().catch(err => {
  console.error(err);
  process.exit(1);
});
