const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs').promises;

const SUPPORT_CHANNEL_ID = '1285796905640788030'; // e.g. '123456789012345678'
const STAFF_USER_IDS = [
  '1285798792842575882', // Add your staff user IDs here as strings
  '1324783261439889439',
  // ...
];
const QNA_FILE = 'support_qna.json';
const LAST_ID_FILE = 'support_qna_last_id.json';
const MAX_MESSAGES = 10000;

async function loadJSON(path, fallback) {
  try {
    const raw = await fs.readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scrape_support')
    .setDescription('Scrape support channel Q&A pairs (admin only)'),
  async execute(interaction) {
    // Only allow admins
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      await interaction.reply({ content: 'You must be an admin to run this command.', ephemeral: true });
      return;
    }

    await interaction.reply('Starting support channel Q&A scrape...');

    try {
      const channel = await interaction.client.channels.fetch(SUPPORT_CHANNEL_ID);
      const lastIdData = await loadJSON(LAST_ID_FILE, {});
      const lastScrapedId = lastIdData.last_id || undefined;

      // Load existing QNA data
      const qnaPairs = await loadJSON(QNA_FILE, []);

      let allMessages = [];
      let lastId = undefined;
      let done = false;

      // Fetch new messages, most recent first, until we hit the last scraped ID
      while (!done) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) break;

        for (const msg of messages.values()) {
          if (msg.id === lastScrapedId) {
            done = true;
            break;
          }
          allMessages.push(msg);
        }
        lastId = messages.last().id;
        if (allMessages.length >= MAX_MESSAGES) break;
        await new Promise(res => setTimeout(res, 500));
      }

      // Sort by timestamp oldest -> newest
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Build a mapping from message ID to message object for fast lookup
      const msgIdMap = {};
      allMessages.forEach(msg => {
        msgIdMap[msg.id] = msg;
      });

      // Only add new Q&A pairs: staff reply (using Discord reply) to a non-staff message
      let newPairs = [];
      for (const msg of allMessages) {
        if (
          STAFF_USER_IDS.includes(msg.author.id) &&
          msg.reference &&
          msg.reference.messageId &&
          msgIdMap[msg.reference.messageId]
        ) {
          const refMsg = msgIdMap[msg.reference.messageId];
          if (!STAFF_USER_IDS.includes(refMsg.author.id)) {
            // Avoid duplicates: only add if this exact Q+A isn't already in the file
            const exists = qnaPairs.some(
              q =>
                q.question_id === refMsg.id &&
                q.answer_id === msg.id
            );
            if (!exists) {
              newPairs.push({
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
      }

      // Append and save
      if (newPairs.length > 0) {
        qnaPairs.push(...newPairs);
        await fs.writeFile(QNA_FILE, JSON.stringify(qnaPairs, null, 2), 'utf-8');
      }
      // Save the newest message ID (if we got any messages)
      if (allMessages.length > 0) {
        await fs.writeFile(LAST_ID_FILE, JSON.stringify({ last_id: allMessages[allMessages.length - 1].id }), 'utf-8');
      }

      await interaction.editReply(`Done! Scraped ${newPairs.length} new Q&A pairs. Total in file: ${qnaPairs.length}.`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('There was an error running the scrape!');
    }
  }
};
