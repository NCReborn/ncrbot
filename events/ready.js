const logger = require('../utils/logger');
const revisionMonitor = require('../services/RevisionMonitor');
const cron = require('node-cron');
const streetCredService = require('../services/StreetCredService');
const snapsmithService = require('../services/SnapSmithService');

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
  }
};