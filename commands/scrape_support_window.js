const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs').promises;

const SUPPORT_CHANNEL_ID = '1285796905640788030';
const STAFF_USER_IDS = [
  '1285798792842575882', // V
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

      // Windowed pairing logic
      let qnaPairs = [];
      let answeredQuestionIds = new Set();
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        if (!STAFF_USER_IDS.includes(msg.author.id) && msg.content.length > 0 && !answeredQuestionIds.has(msg.id)) {
          // Look ahead for a staff answer within WINDOW_SIZE
          for (let j = 1; j <= WINDOW_SIZE && (i + j) < allMessages.length; j++) {
            const candidate = allMessages[i + j];
            if (
              STAFF_USER_IDS.includes(candidate.author.id) &&
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

      await fs.writeFile(OUTPUT_FILE, JSON.stringify(qnaPairs, null, 2), 'utf-8');
      await interaction.editReply(`Done! Window-paired ${qnaPairs.length} Q&A pairs. (Saved to ${OUTPUT_FILE})`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('There was an error running the windowed scrape!');
    }
  }
};
