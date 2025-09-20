const logger = require('./logger');

module.exports = {
  async start(client) {
    const { fetchRevision } = require('./nexusApi');
    const { updateCollectionVersionChannel, updateStatusChannel } = require('./voiceChannelUpdater');
    const { setRevision, getRevision, getRevertAt } = require('./revisionStore');
    const voiceConfig = require('../config/voiceChannels');

    const POLL_INTERVAL = 60 * 1000;
    const COLLECTION_SLUG = 'rcuccp';

    // Get the first guild (edit if you want a specific guild)
    const guild = client.guilds.cache.first();

    // Handle revertAt logic (if set from previous run)
    try {
      const revertAt = await getRevertAt();
      if (revertAt && Date.now() < revertAt) {
        const timeLeft = revertAt - Date.now();
        setTimeout(async () => {
          await updateStatusChannel(guild, voiceConfig.statusStable);
          await setRevision(await getRevision(), null);
        }, timeLeft);
        logger.info(`Scheduled status revert in ${Math.round(timeLeft / 1000 / 60)}min`);
      }
    } catch (err) {
      logger.error('Failed to schedule revertAt:', err);
    }

    // Poll for new revision every POLL_INTERVAL
    setInterval(async () => {
      try {
        const revisionData = await fetchRevision(
          COLLECTION_SLUG,
          null,
          process.env.NEXUS_API_KEY,
          process.env.APP_NAME,
          process.env.APP_VERSION
        );
        const currentRevision = revisionData.revisionNumber;
        const lastRevision = await getRevision();

        if (!lastRevision || currentRevision > lastRevision) {
          await updateCollectionVersionChannel(guild, currentRevision);
          await updateStatusChannel(guild, voiceConfig.statusChecking);

          // Set revertAt for 24h later
          const revertAt = Date.now() + 24 * 60 * 60 * 1000;
          await setRevision(currentRevision, revertAt);
          setTimeout(async () => {
            await updateStatusChannel(guild, voiceConfig.statusStable);
            await setRevision(currentRevision, null);
          }, 24 * 60 * 60 * 1000);

          logger.info(`Detected new revision: ${currentRevision}, status set to Checking, will revert to Stable in 24h`);
        }
      } catch (err) {
        logger.error('Revision polling error:', err);
      }
    }, POLL_INTERVAL);
  }
};
