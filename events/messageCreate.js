const logger = require('../utils/logger');
const { fetchLogAttachment, analyzeLogForErrors, buildErrorEmbed } = require('../utils/logAnalyzer');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    const CRASH_LOG_CHANNEL_ID = process.env.CRASH_LOG_CHANNEL_ID || '1287876503811653785';
    if (
      message.channelId !== CRASH_LOG_CHANNEL_ID ||
      message.author.bot ||
      message.attachments.size === 0
    ) return;

    try {
      for (const [, attachment] of message.attachments) {
        const logContent = await fetchLogAttachment(attachment);
        if (!logContent) continue;

        const analysisResult = await analyzeLogForErrors(logContent);
        const embed = buildErrorEmbed(attachment, analysisResult, logContent, message.url);
        await message.reply({ embeds: [embed] });

        if (analysisResult.matches.length > 0) {
          await message.react('❌');
        } else {
          await message.react('✅');
        }
      }
    } catch (err) {
      logger.error(`[MESSAGE_CREATE] Uncaught error: ${err.stack || err}`);
    }
  }
};
