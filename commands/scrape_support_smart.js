const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs').promises;

// CONFIGURE THESE!
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN; // or paste your token here
const SUPPORT_CHANNEL_ID = '1285796905640788030';
const STAFF_ROLE_IDS = [
  '1285798792842575882', // V (Role ID, not user ID)
  '1324783261439889439', // Techie
  '1370874936456908931', // Fixer
  '1288633895910375464', // Ripperdoc
  // ...
];

const OUTPUT_FILE = './data/support_qna.json';
const MAX_MESSAGES = 10000;
const MAX_ANSWER_DELAY_MS = 10 * 60 * 1000;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

async function scrapeQnA() {
  await client.login(BOT_TOKEN);
  const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
  const guild = channel.guild;

  let allMessages = [];
  let lastId = undefined;
  let totalFetched = 0;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;
    allMessages = allMessages.concat(Array.from(messages.values()));
    totalFetched += messages.size;
    lastId = messages.last().id;
    if (totalFetched >= MAX_MESSAGES) break;
    await new Promise(res => setTimeout(res, 500));
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Pre-fetch all unique members for the messages
  const memberCache = {};
  for (const msg of allMessages) {
    if (!memberCache[msg.author.id]) {
      try {
        memberCache[msg.author.id] = await guild.members.fetch(msg.author.id);
      } catch {
        memberCache[msg.author.id] = null;
      }
    }
  }

  let qnaPairs = [];
  let lastUserMsg = null;
  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    const member = memberCache[msg.author.id];
    const isStaff = member && member.roles.cache.some(role => STAFF_ROLE_IDS.includes(role.id));

    if (!isStaff) {
      lastUserMsg = msg;
    } else if (isStaff && lastUserMsg) {
      const delay = msg.createdTimestamp - lastUserMsg.createdTimestamp;
      if (
        delay > 0 &&
        delay < MAX_ANSWER_DELAY_MS &&
        msg.content.length > 0 &&
        lastUserMsg.content.length > 0
      ) {
        const alreadyPaired = qnaPairs.some(
          pair => pair.question_id === lastUserMsg.id
        );
        if (!alreadyPaired) {
          qnaPairs.push({
            question: lastUserMsg.content,
            question_user: lastUserMsg.author.username,
            question_id: lastUserMsg.id,
            question_time: lastUserMsg.createdAt,
            answer: msg.content,
            answer_user: msg.author.username,
            answer_id: msg.id,
            answer_time: msg.createdAt,
          });
        }
      }
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(qnaPairs, null, 2), 'utf-8');
  console.log(`Smart paired ${qnaPairs.length} Q&A pairs.`);
  process.exit(0);
}

scrapeQnA().catch(err => {
  console.error(err);
  process.exit(1);
});
