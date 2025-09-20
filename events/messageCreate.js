const logger = require('../utils/logger');
const { fetchLogAttachment, analyzeLogForErrors, buildErrorEmbed } = require('../utils/logAnalyzer');
const { loadResponses } = require('../utils/autoResponder');

// Add all roles that should be able to use mod autoresponder here:
const MOD_ROLE_IDS = [
  '1370874936456908931', // existing mod role
  '1288633895910375464' // add your ripperdoc role ID here
];

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // --- Crash Log Channel Logic (unchanged) ---
    const CRASH_LOG_CHANNEL_ID = process.env.CRASH_LOG_CHANNEL_ID || '1287876503811653785';
    if (
      message.channelId === CRASH_LOG_CHANNEL_ID &&
      !message.author.bot &&
      message.attachments.size > 0
    ) {
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
      // Don't return; allow auto-responder to run also if needed
    }

    // --- Mod-Only Auto-Responder Logic (runs in all channels) ---
    try {
      if (message.author.bot) return;
      if (!MOD_ROLE_IDS.some(id => message.member?.roles.cache.has(id))) return;

      const responses = loadResponses();
      for (const entry of responses) {
        const msgContent = message.content.toLowerCase();
        const trigger = entry.trigger.toLowerCase();

        const isMatch = entry.wildcard
          ? msgContent.includes(trigger)
          : msgContent === trigger;

        if (isMatch) {
          // Always send a standalone message (never as a reply, never mentioning anyone)
          await message.channel.send({ content: entry.response });
          break;
        }
      }
    } catch (err) {
      logger.error(`[MESSAGE_CREATE][AUTORESPONDER] Uncaught error: ${err.stack || err}`);
    }
  }
};
