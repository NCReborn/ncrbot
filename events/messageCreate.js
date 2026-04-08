const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const { fetchLogAttachment, analyzeLogForErrors, buildErrorEmbed } = require('../utils/logAnalyzer');
const { loadResponses } = require('../utils/autoResponder');
const botcontrol = require('../commands/botcontrol.js');
const { PermissionChecker } = require('../utils/permissions');
const CONSTANTS = require('../config/constants');
const spamDetector = require('../services/spam/SpamDetector');
const spamActionHandler = require('../services/spam/SpamActionHandler');
const nsfwDetector = require('../services/nsfw/NsfwDetector');
const nsfwActionHandler = require('../services/nsfw/NsfwActionHandler');
const streetCredService = require('../services/StreetCredService');
const scs = streetCredService;
const analyticsService = require('../services/AnalyticsService');

/**
 * Build a Street Creed announcement embed for first-time rank or level-up.
 * @param {GuildMember} member
 * @param {object} result  — { tier, prevTier, score, messages, changed }
 * @returns {EmbedBuilder}
 */
function buildStreetCredAnnouncement(member, result) {
  const { tier, prevTier, score, messages } = result;
  const displayName = member.displayName;
  const avatar = member.displayAvatarURL({ size: 128 });

  const months = scs.tenureMonths(member.joinedAt || new Date());
  const multiplier = scs.tenureMultiplier(months);

  const nextThreshold = scs.nextTierThreshold(tier);
  const nextTierIdx = scs.TIERS.indexOf(tier) - 1;
  const nextTierNum = nextTierIdx >= 0 ? scs.TIERS[nextTierIdx] : null;
  const nextGoal = nextThreshold && nextTierNum
    ? `SC-${nextTierNum} at ${Math.round(nextThreshold).toLocaleString()}`
    : 'Max Tier! 🏆';

  const formattedScore = Math.round(score).toLocaleString();
  const formattedMessages = messages.toLocaleString();

  // Scenario A: First-time rank
  if (prevTier === 0) {
    return new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🏙️ Welcome to Street Creed!')
      .setThumbnail(avatar)
      .setDescription(`**${displayName}** just earned their first Street Creed rank!`)
      .addFields(
        { name: 'Rank',      value: `SC-${tier}`,        inline: true },
        { name: 'Score',     value: formattedScore,       inline: true },
        { name: 'Messages',  value: formattedMessages,    inline: true },
        { name: 'Next Goal', value: nextGoal,             inline: true },
      )
      .setFooter({ text: 'Keep chatting to climb the ranks!' });
  }

  // Scenario B: Level-up
  let embedColor = 0x2ecc71;
  const roleId = scs.ROLE_MAP[String(tier)];
  if (roleId) {
    const role = member.guild.roles.cache.get(roleId);
    if (role && role.color) embedColor = role.color;
  }

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('⬆️ Street Creed Level Up!')
    .setThumbnail(avatar)
    .setDescription(`**${displayName}** levelled up!`)
    .addFields(
      { name: 'Previous Rank', value: `SC-${prevTier}`,                inline: true },
      { name: 'New Rank',      value: `SC-${tier}`,                    inline: true },
      { name: 'Score',         value: formattedScore,                  inline: true },
      { name: 'Multiplier',    value: `${multiplier.toFixed(2)}×`,     inline: true },
      { name: 'Next Goal',     value: nextGoal,                        inline: true },
    )
    .setFooter({ text: '🔥 Keep it up, Choom!' });
}

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

    // NSFW image scanning for monitored channels (e.g. #showcase)
    try {
      if (
        !message.author.bot &&
        message.guild &&
        !PermissionChecker.hasModRole(message.member) &&
        nsfwDetector.isMonitoredChannel(message.channelId) &&
        message.attachments.size > 0
      ) {
        for (const [, attachment] of message.attachments) {
          if (!attachment.contentType?.startsWith('image/')) continue;

          const result = await nsfwDetector.classifyImage(attachment.url);
          if (!result || result.skipped) continue;

          if (result.confidenceLevel === 'high') {
            await nsfwActionHandler.handleHighConfidence(client, message, result.predictions, attachment.url, result.hash);
          } else if (result.confidenceLevel === 'medium') {
            await nsfwActionHandler.handleMediumConfidence(client, message, result.predictions, attachment.url, result.hash);
          }
        }
      }
    } catch (err) {
      logger.error('[NSFW] Error during image scanning:', err);
    }

    // Street Creed forward-tracking
    if (!message.author.bot && message.guild) {
      try {
        const result = await streetCredService.trackMessage(message);

        if (result && result.changed && result.tier >= 1) {
          const botSpamChannel = await message.client.channels.fetch(CONSTANTS.CHANNELS.BOT_SPAM).catch(() => null);
          if (botSpamChannel) {
            const embed = buildStreetCredAnnouncement(message.member, result);
            await botSpamChannel.send({ embeds: [embed] }).catch(() => {});
          }
        }
      } catch (err) {
        logger.error(`[STREET_CRED] trackMessage uncaught: ${err.message}`);
      }

      analyticsService.trackMessageAnalytics(message).catch(err =>
        logger.error(`[ANALYTICS] trackMessageAnalytics uncaught: ${err.message}`)
      );
    }
  }
};
