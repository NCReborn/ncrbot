const logger = require('../utils/logger');
const { fetchLogAttachment, analyzeLogForErrors, buildErrorEmbed } = require('../utils/logAnalyzer');
const { loadResponses } = require('../utils/autoResponder');
const botcontrol = require('../commands/botcontrol.js');
const { PermissionChecker } = require('../utils/permissions');
const CONSTANTS = require('../config/constants');
const spamDetector = require('../services/spam/SpamDetector');
const spamActionHandler = require('../services/spam/SpamActionHandler');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (botcontrol.botStatus.muted) return;

    // Log analysis for crash log channel
    if (
      message.channelId === CONSTANTS.CHANNELS.CRASH_LOG &&
      !message.author.bot &&
      message.attachments.size > 0
    ) {
      try {
        const embeds = [];
        let hasErrors = false;

        for (const [, attachment] of message.attachments) {
          const logContent = await fetchLogAttachment(attachment);
          if (!logContent) continue;

          const analysisResult = await analyzeLogForErrors(logContent);
          const embed = buildErrorEmbed(attachment, analysisResult, logContent, message.url);
          embeds.push(embed);

          if (analysisResult.matchedRules.length > 0) hasErrors = true;
        }

        if (embeds.length) {
          await message.channel.send({ embeds });

          if (hasErrors) {
            await message.react('❌');
          } else {
            await message.react('✅');
          }
        }
      } catch (err) {
        logger.error(`[MESSAGE_CREATE] Uncaught error: ${err.stack || err}`);
      }
    }

    // Autoresponder (mods only) — use if-block instead of early return
    try {
      if (!message.author.bot && PermissionChecker.hasModRole(message.member)) {
        const responses = loadResponses();
        for (const entry of responses) {
          const msgContent = message.content.toLowerCase();
          const trigger = entry.trigger.toLowerCase();

          const isMatch = entry.wildcard
            ? msgContent.includes(trigger)
            : msgContent === trigger;

          if (isMatch) {
            await message.channel.send({ content: entry.response });
            break;
          }
        }
      }
    } catch (err) {
      logger.error(`[MESSAGE_CREATE][AUTORESPONDER] Uncaught error: ${err.stack || err}`);
    }

    // Anti-spam detection — now always reached for non-bot guild messages
    try {
      if (message.author.bot || !message.guild) return;
      
      const detectionResult = await spamDetector.detectSpam(message, message.member);
      
      if (detectionResult?.detected) {
        await spamActionHandler.handleSpamDetection(client, message, message.member, detectionResult);
      }
    } catch (err) {
      logger.error('[SPAM] Error:', err);
    }
  }
};
