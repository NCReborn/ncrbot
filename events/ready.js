const logger = require('../utils/logger');
const { sendLogScanButton } = require('../utils/logScanTicket');
const revisionMonitor = require('../services/RevisionMonitor');
const cron = require('node-cron');
const streetCredService = require('../services/StreetCredService');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}`);
    logger.info(`Loaded ${client.commands.size} commands.`);
    logger.info(`Crash log channel: ${process.env.CRASH_LOG_CHANNEL_ID}`);
    logger.info(`Log scan channel: ${process.env.LOG_SCAN_CHANNEL_ID}`);
    
    client.user.setActivity('/help for commands', { type: 'LISTENING' });

    try {
      await sendLogScanButton(client, process.env.LOG_SCAN_CHANNEL_ID);
    } catch (err) {
      logger.error(`Error sending log scan button:`, err);
    }

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
  }
};
