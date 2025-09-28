const logger = require('../utils/logger');
const { sendLogScanButton } = require('../utils/logScanTicket');

module.exports = {
  name: 'clientReady', // <-- FIXED: use clientReady for Discord.js v15+
  once: true,
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}`);
    logger.info(`Loaded ${client.commands.size} commands.`);
    logger.info(`Crash log channel: ${process.env.CRASH_LOG_CHANNEL_ID}, Log scan channel: ${process.env.LOG_SCAN_CHANNEL_ID}`);
    logger.info(`Revision polling enabled: ${!!process.env.NEXUS_API_KEY}`);
    client.user.setActivity('/help for commands', { type: 'LISTENING' });

    // Send log scan button (as before)
    try {
      await sendLogScanButton(client, process.env.LOG_SCAN_CHANNEL_ID);
    } catch (err) {
      logger.error(`Error sending log scan button: ${err.stack || err}`);
    }

    // ...move the revision polling logic here as a helper function or another util.
    require('../utils/revisionPoller').start(client);
  }
};
