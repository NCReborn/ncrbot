const logger = require('../utils/logger');
const { loadResponses } = require('../utils/autoResponder');
const { PermissionChecker } = require('../utils/permissions');
const CONSTANTS = require('../config/constants');
const spamDetector = require('../services/spam/SpamDetector');
const SpamActionHandler = require('../services/spam/SpamActionHandler');
const streetCredService = require('../services/StreetCredService');
const analyticsService = require('../services/AnalyticsService');
const { handleModRequestModeration } = require('../moderation/modRequestGuard');
const { getGuildChannelId } = require('../utils/guildConfig');
const { trackHandlerExecution } = require('../utils/runtimeMonitor');

// ⭐ SnapMaster
const snapmaster = require('../utils/snapmaster');
const warnedMissingShowcaseGuilds = new Set();

// SnapMaster is an NCR-only feature (its data store and /snapmaster-scan
// are both single-guild already). It used to resolve its channel via the
// same generic getGuildChannelId(guildId, 'showcase') lookup the website's
// Choomba showcase watcher uses -- which meant any guild added to
// SHOWCASE_CHANNEL_IDS for that unrelated feature (e.g. the CPE guild's
// #gallery, for preemteam.com) also got its posts counted as SnapMaster
// submissions. Gating on this guild ID keeps the two features from
// sharing scope again in the future, regardless of what else gets added
// to SHOWCASE_CHANNEL_IDS.
const SNAPMASTER_GUILD_ID = '1285796904160202752';

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    return trackHandlerExecution(
      'messageCreate',
      {
        guildId: message.guild?.id || null,
        channelId: message.channelId || null,
        authorId: message.author?.id || null,
        messageId: message.id || null,
        isBot: Boolean(message.author?.bot),
      },
      async () => {
        await handleModRequestModeration(message);

        const spamActionHandler = SpamActionHandler.getInstance(client);

        // ⭐ Autoresponder (mods only)
        try {
          if (!message.author.bot && PermissionChecker.hasModRole(message.member)) {
            const responses = loadResponses(message.guild?.id);
            for (const entry of responses) {
              const msgContent = message.content.toLowerCase();
              const trigger = entry.trigger.toLowerCase();

              const isMatch = entry.wildcard
                ? msgContent.includes(trigger)
                : msgContent === trigger;

              const allowedChannels = entry.allowedChannelIds;
              const channelAllowed =
                !allowedChannels ||
                allowedChannels.length === 0 ||
                allowedChannels.includes(message.channelId);

              if (isMatch && channelAllowed) {
                await message.channel.send({ content: entry.response });
                break;
              }
            }
          }
        } catch (err) {
          logger.error(`[MESSAGE_CREATE][AUTORESPONDER] Uncaught error: ${err.stack || err}`);
        }

        // ⭐ Anti-spam detection
        try {
          if (message.author.bot || !message.guild) return;

          const detectionResult = await spamDetector.detectSpam(message, message.member);

          if (detectionResult?.detected) {
            await spamActionHandler.handleDetection(detectionResult, message);
          }
        } catch (err) {
          logger.error('[SPAM] Error:', err);
        }

        // ⭐⭐⭐ SNAPMASTER TRACKING (NCR guild only -- see SNAPMASTER_GUILD_ID above) ⭐⭐⭐
        try {
          const showcaseChannelId = message.guild?.id === SNAPMASTER_GUILD_ID
            ? getGuildChannelId(message.guild.id, 'showcase')
            : null;

          if (
            message.guild?.id === SNAPMASTER_GUILD_ID &&
            !showcaseChannelId &&
            !warnedMissingShowcaseGuilds.has(message.guild.id)
          ) {
            warnedMissingShowcaseGuilds.add(message.guild.id);
            logger.warn(`[SNAPMASTER] Missing showcase channel mapping for guild ${message.guild.id}.`);
          }

          if (!message.author.bot && showcaseChannelId && message.channel.id === showcaseChannelId) {
            const attachments = [...message.attachments.values()];
            const imageAttachments = attachments.filter((a) => a.contentType?.startsWith('image'));
            const imageCount = imageAttachments.length;

            if (imageCount > 0) {
              const link = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
              const imageUrls = imageAttachments.map((a) => a.url);
              snapmaster.addSubmission(message.author.id, imageCount, link, imageUrls);

              console.log(`SnapMaster: +${imageCount} submission(s) for ${message.author.tag}`);
            }
          }
        } catch (err) {
          logger.error(`[SNAPMASTER] Error: ${err.stack || err}`);
        }

        // ⭐ StreetCred + Analytics
        if (!message.author.bot && message.guild) {
          try {
            await streetCredService.trackMessage(message);
          } catch (err) {
            logger.error(`[STREET_CRED] trackMessage uncaught: ${err.message}`);
          }

          analyticsService.trackMessageAnalytics(message).catch((err) =>
            logger.error(`[ANALYTICS] trackMessageAnalytics uncaught: ${err.message}`)
          );
        }
      }
    );
  },
};
