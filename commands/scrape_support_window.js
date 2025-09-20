// ---- Global error handlers ----
process.on('uncaughtException', function (err) {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
});

const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs').promises;

const SUPPORT_CHANNEL_ID = '1285796905640788030';
const STAFF_ROLE_IDS = [
  '1285798792842575882', // V (Role ID, not user ID)
  '1324783261439889439', // Techie
  '1370874936456908931', // Fixer
  '1288633895910375464', // Ripperdoc
  // ...
];

const OUTPUT_FILE = './data/support_qna.json';
const LAST_ID_FILE = './data/support_qna_lastid.json';
const MAX_MESSAGES = 10000;
const WINDOW_SIZE = 5; // Number of messages to look ahead for a staff answer

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scrape_support_window')
    .setDescription('Scrape support channel Q&A pairs using windowed message logic (admin only, incremental)'),
  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      await interaction.reply({ content: 'You must be an admin to run this command.', ephemeral: true });
      return;
    }

    await interaction.reply('Starting windowed Q&A scrape for support channel (incremental)...');

    // Load last scraped message ID
    let lastScrapedId = null;
    try {
      const lastIdData = await fs.readFile(LAST_ID_FILE, 'utf-8');
      lastScrapedId = JSON.parse(lastIdData).lastId;
    } catch {
      // File does not exist or unreadable, treat as first run
      lastScrapedId = null;
    }

    try {
      const channel = await interaction.client.channels.fetch(SUPPORT_CHANNEL_ID);
      const guild = interaction.guild;

      let allMessages = [];
      let lastId = undefined;
      let totalFetched = 0;
      let done = false;

      // Fetch all new messages (after lastScrapedId, if set)
      while (!done) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        if (lastScrapedId && !lastId) options.after = lastScrapedId;
        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) break;
        const arr = Array.from(messages.values());
        allMessages = allMessages.concat(arr);
        totalFetched += messages.size;
        lastId = messages.last().id;
        // Stop if we hit MAX_MESSAGES or no more new messages
        if (totalFetched >= MAX_MESSAGES) break;
        // If after is set, and the oldest message is lastScrapedId, stop
        if (lastScrapedId && arr.some(msg => msg.id === lastScrapedId)) {
          done = true;
        }
        await new Promise(res => setTimeout(res, 500)); // Throttle to avoid rate limits
      }

      if (allMessages.length === 0) {
        await interaction.editReply('No new messages to scrape.');
        return;
      }

      // Sort by timestamp oldest -> newest
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Load any existing Q&A pairs
      let qnaPairs = [];
      try {
        const prevData = await fs.readFile(OUTPUT_FILE, 'utf-8');
        qnaPairs = JSON.parse(prevData);
        if (!Array.isArray(qnaPairs)) qnaPairs = [];
      } catch {
        // If file does not exist, start fresh
        qnaPairs = [];
      }

      // Pre-fetch all unique members for the messages
      const memberCache = {};
      for (const msg of allMessages) {
        if (!memberCache[msg.author.id]) {
          try {
            memberCache[msg.author.id] = await guild.members.fetch(msg.author.id);
          } catch (e) {
            if (e.code !== 10007) {
              console.error(`Failed to fetch member for ${msg.author.id}:`, e && e.stack ? e.stack : e);
            }
            memberCache[msg.author.id] = null;
          }
        }
      }

      // Windowed pairing logic (by staff role)
      let answeredQuestionIds = new Set(qnaPairs.map(pair => pair.question_id));
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        const member = memberCache[msg.author.id];
        const isStaff = member && member.roles.cache.some(role => STAFF_ROLE_IDS.includes(role.id));
        if (!isStaff && msg.content.length > 0 && !answeredQuestionIds.has(msg.id)) {
          // Look ahead for a staff answer within WINDOW_SIZE
          for (let j = 1; j <= WINDOW_SIZE && (i + j) < allMessages.length; j++) {
            const candidate = allMessages[i + j];
            const candidateMember = memberCache[candidate.author.id];
            const candidateIsStaff = candidateMember && candidateMember.roles.cache.some(role => STAFF_ROLE_IDS.includes(role.id));
            if (
              candidateIsStaff &&
              candidate.content.length > 0
            ) {
              qnaPairs.push({
                question: msg.content,
                question_user: msg.author.username,
                question_id: msg.id,
                question_time: msg.createdAt,
                answer: candidate.content,
                answer_user: candidate.author.username,
                answer_id: candidate.id,
                answer_time: candidate.createdAt,
              });
              answeredQuestionIds.add(msg.id);
              break; // Only pair to the first staff answer in the window
            }
          }
        }
      }

      // Save updated Q&A pairs
      try {
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(qnaPairs, null, 2), 'utf-8');
      } catch (e) {
        console.error('Failed to write Q&A output file:', e && e.stack ? e.stack : e);
        await interaction.editReply('Error: Could not write Q&A output file!');
        return;
      }

      // Save the newest message ID
      const newestMessage = allMessages[allMessages.length - 1];
      if (newestMessage) {
        await fs.writeFile(LAST_ID_FILE, JSON.stringify({ lastId: newestMessage.id }), 'utf-8');
      }

      await interaction.editReply(`Done! Window-paired ${qnaPairs.length} total Q&A pairs. Processed ${allMessages.length} new messages.`);
    } catch (err) {
      console.error('[scrape_support_window] Top-level error:', err && err.stack ? err.stack : err);
      try {
        await interaction.editReply('There was an error running the windowed scrape!');
      } catch (_) {}
    }
  }
};
