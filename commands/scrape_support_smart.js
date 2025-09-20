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
const MAX_ANSWER_DELAY_MS = 10 * 60 * 1000; // 10 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scrape_support_smart')
    .setDescription('Scrape support channel Q&A pairs using smart logic (admin only)'),
  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      await interaction.reply({ content: 'You must be an admin to run this command.', ephemeral: true });
      return;
    }

    await interaction.reply('Starting smart Q&A scrape for support channel...');

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

      // Smart pairing logic
      let qnaPairs = [];
      let lastUserMsg = null;
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        const isStaff = STAFF_USER_IDS.includes(msg.author.id);

        if (!isStaff) {
          lastUserMsg = msg;
        } else if (isStaff && lastUserMsg) {
          // Only pair if the staff message is reasonably close after the user question
          const delay = msg.createdTimestamp - lastUserMsg.createdTimestamp;
          if (
            delay > 0 &&
            delay < MAX_ANSWER_DELAY_MS &&
            msg.content.length > 0 &&
            lastUserMsg.content.length > 0
          ) {
            // Avoid duplicate answers for the same question
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
      await interaction.editReply(`Done! Smart paired ${qnaPairs.length} Q&A pairs. (Saved to ${OUTPUT_FILE})`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('There was an error running the smart scrape!');
    }
  }
};
