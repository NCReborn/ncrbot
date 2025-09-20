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
const MAX_MESSAGES = 10000;
const WINDOW_SIZE = 5; // Number of messages to look ahead for a staff answer

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scrape_support_window')
    .setDescription('Scrape support channel Q&A pairs using windowed message logic (admin only)'),
  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      await interaction.reply({ content: 'You must be an admin to run this command.', ephemeral: true });
      return;
    }

    await interaction.reply('Starting windowed Q&A scrape for support channel...');

    try {
      const channel = await interaction.client.channels.fetch(SUPPORT_CHANNEL_ID);
      const guild = interaction.guild;

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

      // Pre-fetch all unique members for the messages
      const memberCache = {};
      for (const msg of allMessages) {
        if (!memberCache[msg.author.id]) {
          try {
            memberCache[msg.author.id] = await guild.members.fetch(msg.author.id);
          } catch (e) {
            console.error(`Failed to fetch member for ${msg.author.id}:`, e && e.stack ? e.stack : e);
            memberCache[msg.author.id] = null;
          }
        }
      }

      // Windowed pairing logic (by staff role)
      let qnaPairs = [];
      let answeredQuestionIds = new Set();
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

      try {
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(qnaPairs, null, 2), 'utf-8');
      } catch (e) {
        console.error('Failed to write Q&A output file:', e && e.stack ? e.stack : e);
        await interaction.editReply('Error: Could not write Q&A output file!');
        return;
      }

      await interaction.editReply(`Done! Window-paired ${qnaPairs.length} Q&A pairs. (Saved to ${OUTPUT_FILE})`);
    } catch (err) {
      console.error('[scrape_support_window] Top-level error:', err && err.stack ? err.stack : err);
      try {
        await interaction.editReply('There was an error running the windowed scrape!');
      } catch (_) {}
    }
  }
};
