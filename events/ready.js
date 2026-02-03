const logger = require('../utils/logger');
const { sendLogScanButton } = require('../utils/logScanTicket');
const revisionMonitor = require('../services/RevisionMonitor');

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
  }
};
