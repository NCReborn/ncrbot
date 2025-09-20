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

const OUTPUT_FILE = 'support_qna.json';
const MAX_MESSAGES = 10000; // Set a limit to avoid huge scrapes on first run!

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

  // Find Q&A pairs: a non-staff message followed by a staff reply (simple heuristic)
  let qnaPairs = [];
  for (let i = 0; i < allMessages.length - 1; i++) {
    const qMsg = allMessages[i];
    const aMsg = allMessages[i + 1];
    if (!STAFF_USER_IDS.includes(qMsg.author.id) && STAFF_USER_IDS.includes(aMsg.author.id)) {
      // Optionally, check if the answer directly replies to the question
      // if (aMsg.reference && aMsg.reference.messageId === qMsg.id) { ... }
      qnaPairs.push({
        question: qMsg.content,
        question_user: qMsg.author.username,
        question_id: qMsg.id,
        question_time: qMsg.createdAt,
        answer: aMsg.content,
        answer_user: aMsg.author.username,
        answer_id: aMsg.id,
        answer_time: aMsg.createdAt,
      });
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(qnaPairs, null, 2), 'utf-8');
  console.log(`Scraped ${qnaPairs.length} Q&A pairs.`);
  process.exit(0);
}

scrapeQnA().catch(err => {
  console.error(err);
  process.exit(1);
});
