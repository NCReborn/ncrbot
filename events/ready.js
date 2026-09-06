const logger = require('../utils/logger');
const revisionMonitor = require('../services/RevisionMonitor');
const cron = require('node-cron');
const streetCredService = require('../services/StreetCredService');
const { buildLeaderboardPayload } = require('../services/StreetCredSiteSnapshot');
const { dispatchStreetCredToSite } = require('../utils/siteStreetCredDispatcher');
const snapsmithService = require('../services/SnapSmithService');
const { initShowcaseWatcher } = require('../services/showcase/showcaseWatcher');
const collectionHealthService = require('../services/CollectionHealthService');
const guildConfigManager = require('../config/guildConfigManager');
const { getGuildChannelId } = require('../utils/guildConfig');
const { fetchRevision } = require('../utils/nexusApi');

// ⭐ SnapMaster
const snapmaster = require('../utils/snapmaster');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}`);
    logger.info(`Loaded ${client.commands.size} commands.`);

    client.user.setActivity('/help for commands', { type: 'LISTENING' });

    try {
      await revisionMonitor.start(client);
      logger.info('[READY] Revision monitoring started');
    } catch (err) {
      logger.error('[READY] Error starting revision monitor:', err);
    }

    initShowcaseWatcher(client); // add this
    logger.info('[READY] Showcase watcher started'); // add this

    // Daily dormancy check — runs at 03:00 every day
    cron.schedule('0 3 * * *', async () => {
      logger.info('[STREET_CRED] Running daily dormancy check…');
      for (const [, guild] of client.guilds.cache) {
        try {
          await streetCredService.runDormancyCheck(guild);
        } catch (err) {
          logger.error(`[STREET_CRED] Dormancy check failed for guild ${guild.id}: ${err.message}`);
        }
      }
    });
    logger.info('[READY] Street Creed daily dormancy cron registered (runs at 03:00)');

    // Daily SnapSmith expiration check — runs at 04:00 every day
    cron.schedule('0 4 * * *', async () => {
      logger.info('[SNAPSMITH] Running daily expiration check…');
      for (const [, guild] of client.guilds.cache) {
        try {
          await snapsmithService.runExpirationCheck(guild);
        } catch (err) {
          logger.error(`[SNAPSMITH] Expiration check failed for guild ${guild.id}: ${err.message}`);
        }
      }
    });
    logger.info('[READY] SnapSmith daily expiration cron registered (runs at 04:00)');

    // ⭐⭐⭐ SNAPMASTER — Monthly Eligibility Report (25th @ 12:00 UTC)
    cron.schedule('0 12 25 * *', async () => {
      logger.info('[SNAPMASTER] Running monthly eligibility report…');

      const ADMIN_CHANNEL = "1324990321393930240";
      const channel = client.channels.cache.get(ADMIN_CHANNEL);

      if (!channel) {
        logger.error('[SNAPMASTER] Admin channel not found.');
        return;
      }

      // Build forum posts for eligible users
      try {
        const { buildSnapmasterForum } = require('../commands/snapmaster-forum');
        await buildSnapmasterForum(channel.guild);
        logger.info('[SNAPMASTER] Forum posts created successfully.');
      } catch (err) {
        logger.error('[SNAPMASTER] Error creating forum posts:', err);
      }

      // Send summary to admin channel
      const eligible = snapmaster.getEligible(5);
      const all = snapmaster.getAll();

      let msg = "**📸 SnapMaster Eligibility Report**\n";
      msg += "_Monthly showcase submissions summary_\n\n";

      msg += "**Eligible Members (≥ 5 submissions):**\n";

      if (eligible.length === 0) {
        msg += "_No eligible members this month._\n\n";
      } else {
        eligible.forEach(e => {
          msg += `• <@${e.userId}> — ${e.count} submissions\n`;
        });
        msg += "\n";
      }

      msg += "**Full Submission Tally:**\n";
      for (const [userId, data] of Object.entries(all)) {
        msg += `• <@${userId}> — ${data.count}\n`;
      }

      await channel.send(msg);
      logger.info('[SNAPMASTER] Eligibility report posted.');
    });

    logger.info('[READY] SnapMaster monthly eligibility cron registered (25th @ 12:00 UTC)');

    // ⭐⭐⭐ SNAPMASTER — Monthly Reset (1st @ 00:00 UTC)
    cron.schedule('0 0 1 * *', async () => {
      logger.info('[SNAPMASTER] Running monthly reset…');

      try {
        snapmaster.reset();
        logger.info('[SNAPMASTER] Monthly reset complete.');
      } catch (err) {
        logger.error('[SNAPMASTER] Monthly reset failed:', err);
      }
    });

    logger.info('[READY] SnapMaster monthly reset cron registered (1st @ 00:00 UTC)');

    // Daily StreetCred site leaderboard snapshot — runs at 05:00 UTC.
    // dispatchStreetCredToSite is itself a no-op for every guild except
    // the one the site publishes for, so this loop stays harmless even
    // though it iterates every guild the bot is in.
    cron.schedule('0 5 * * *', async () => {
      logger.info('[STREET_CRED] Running daily site leaderboard snapshot…');
      for (const [, guild] of client.guilds.cache) {
        try {
          await guild.members.fetch().catch(() => {});
          const cfg = await streetCredService.getGuildConfig(guild.id);
          const activeRows = await streetCredService.getAllActive(guild.id);
          const entries = buildLeaderboardPayload(guild, activeRows, cfg, streetCredService.getTierLabel);
          await dispatchStreetCredToSite(guild.id, entries);
        } catch (err) {
          logger.error(`[STREET_CRED] Site snapshot failed for guild ${guild.id}: ${err.message}`);
        }
      }
    });
    logger.info('[READY] StreetCred site leaderboard cron registered (runs at 05:00)');

    // Hourly collection-health batch — opt-in per guild via
    // COLLECTION_HEALTH_CHANNEL_IDS (see utils/guildConfig.js). Spreads
    // checking every mod in a collection across ~24 runs instead of one
    // sweep, so even a 900+ mod collection stays well under Nexus's API
    // rate limits. Posts a report to the configured channel once a full
    // sweep completes, then starts the next one from scratch.
    cron.schedule('0 * * * *', async () => {
      for (const [, guild] of client.guilds.cache) {
        const reportChannelId = getGuildChannelId(guild.id, 'collectionHealth');
        if (!reportChannelId) continue; // not opted in for this guild

        const guildConfig = guildConfigManager.loadGuildConfig(guild.id);
        for (const collection of guildConfig.collections || []) {
          try {
            let modFiles = [];
            if (!collectionHealthService.hasActiveSweep(guild.id, collection.slug)) {
              const revisionData = await fetchRevision(
                collection.slug,
                null,
                process.env.NEXUS_API_KEY,
                process.env.APP_NAME,
                process.env.APP_VERSION
              );
              modFiles = revisionData.modFiles || [];
            }

            const result = await collectionHealthService.runBatch(guild.id, collection.slug, modFiles, {
              apiKey: process.env.NEXUS_API_KEY,
              appName: process.env.APP_NAME,
              appVersion: process.env.APP_VERSION
            });

            if (result.done) {
              const channel = await client.channels.fetch(reportChannelId).catch(() => null);
              if (channel) {
                const embed = collectionHealthService.buildHealthReportEmbed(collection.display, result.results);
                await channel.send({ embeds: [embed] });
              } else {
                logger.warn(`[COLLECTION_HEALTH] Report channel ${reportChannelId} not found for guild ${guild.id}`);
              }
              collectionHealthService.resetSweep(guild.id, collection.slug);
              logger.info(`[COLLECTION_HEALTH] Sweep complete for ${collection.display} in guild ${guild.id} (${result.totalMods} mods)`);
            } else {
              logger.info(`[COLLECTION_HEALTH] ${collection.display}: ${result.checkedSoFar}/${result.totalMods} checked this sweep`);
            }
          } catch (err) {
            logger.error(`[COLLECTION_HEALTH] Batch failed for ${collection.slug} in guild ${guild.id}: ${err.message}`);
          }
        }
      }
    });
    logger.info('[READY] Collection health hourly cron registered');
  }
};
