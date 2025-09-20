const logger = require('../utils/logger');
const { fetchLogAttachment, analyzeLogForErrors, buildErrorEmbed } = require('../utils/logAnalyzer');
const { loadResponses } = require('../utils/autoResponder');

const MOD_ROLE_ID = '1288633895910375464'; // <-- Replace with your actual mod role ID

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // --- Crash Log Channel Logic ---
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
      // Skip if bot
      if (message.author.bot) return;

      // Only respond to mods
      if (!message.member?.roles.cache.has(MOD_ROLE_ID)) {
        console.log(`[AutoResponder] User ${message.author.tag} does NOT have mod role.`);
        return;
      }
      // Debug: Confirm mod message is being processed
      console.log(`[AutoResponder] Matched mod: ${message.author.tag}, message: '${message.content}'`);

      const responses = loadResponses();
      console.log("[AutoResponder] Loaded responses:", responses);

      for (const entry of responses) {
        // Debug: Log matching attempts
        console.log(`[AutoResponder] Checking trigger '${entry.trigger}' (wildcard: ${entry.wildcard}) against message '${message.content}'`);
        if (
          (entry.wildcard && message.content.toLowerCase().includes(entry.trigger.toLowerCase())) ||
          (!entry.wildcard && message.content.toLowerCase() === entry.trigger.toLowerCase())
        ) {
          console.log(`[AutoResponder] Trigger matched: '${entry.trigger}' -> Responding with: '${entry.response}'`);
          await message.reply(entry.response);
          break;
        }
      }
    } catch (err) {
      logger.error(`[MESSAGE_CREATE][AUTORESPONDER] Uncaught error: ${err.stack || err}`);
    }
  }
};
