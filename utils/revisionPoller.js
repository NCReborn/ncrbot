const logger = require('./logger');
const { getCollectionRevision, setCollectionRevision, loadState } = require('./revisionState');
const { getCollectionSlug } = require('./nexusApi');
const { sendCombinedChangelogMessages, sendSingleChangelogMessages } = require('../services/changelogService');

const COLLECTIONS = [
  { name: 'ncr', compare: 'adr', channelId: '1285797113879334962' },
  { name: 'ncrlite', compare: 'adrlite', channelId: '1387411802035585086' }
];

module.exports = {
  async start(client) {
    const { fetchRevision } = require('./nexusApi');
    const { updateCollectionVersionChannel, updateStatusChannel } = require('./voiceChannelUpdater');
    const { setRevision, getRevision, getRevertAt } = require('./revisionStore');
    const voiceConfig = require('../config/voiceChannels');

    const POLL_INTERVAL = 60 * 1000;
    const MAIN_COLLECTION_SLUG = 'rcuccp';

    // Load previous revision state
    loadState(logger);

    // Get the first guild (or pick one explicitly)
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

    setInterval(async () => {
      try {
        // MAIN polling for status/voice channel
        const revisionData = await fetchRevision(
          MAIN_COLLECTION_SLUG,
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

        // --- Diff and post changelog logic ---
        for (const { name, compare, channelId } of COLLECTIONS) {
          const slug1 = getCollectionSlug(name);
          const slug2 = getCollectionSlug(compare);

          // Get previous and current revisions for both collections
          const prevRev1 = getCollectionRevision(slug1);
          const prevRev2 = getCollectionRevision(slug2);

          // Fetch latest revision numbers for each collection
          const data1 = await fetchRevision(slug1, null, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
          const data2 = await fetchRevision(slug2, null, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
          const newRev1 = data1.revisionNumber;
          const newRev2 = data2.revisionNumber;

          // Only post if either collection has a new revision
          if ((prevRev1 && newRev1 > prevRev1) || (prevRev2 && newRev2 > prevRev2)) {
            try {
              const channel = await client.channels.fetch(channelId);

              // Both collections updated
              if ((prevRev1 && newRev1 > prevRev1) && (prevRev2 && newRev2 > prevRev2)) {
                await sendCombinedChangelogMessages(
                  channel,
                  null, null, null,
                  slug1, prevRev1, newRev1,
                  slug2, prevRev2, newRev2
                );
                logger.info(`[DIFF-AUTO] Posted combined changelog for ${name}/${compare} in #${channelId}`);
              }
              // Only collection 1 updated
              else if (prevRev1 && newRev1 > prevRev1) {
                await sendSingleChangelogMessages(
                  channel,
                  null, // diffs calculated internally
                  slug1, prevRev1, newRev1, name.toUpperCase()
                );
                logger.info(`[DIFF-AUTO] Posted single changelog for ${name} in #${channelId}`);
              }
              // Only collection 2 updated
              else if (prevRev2 && newRev2 > prevRev2) {
                await sendSingleChangelogMessages(
                  channel,
                  null, // diffs calculated internally
                  slug2, prevRev2, newRev2, compare.toUpperCase()
                );
                logger.info(`[DIFF-AUTO] Posted single changelog for ${compare} in #${channelId}`);
              }
            } catch (err) {
              logger.error(`[DIFF-AUTO] Failed to send changelog for ${name}/${compare}: ${err.stack || err}`);
            }
          }

          // Update stored revision numbers for next poll
          setCollectionRevision(slug1, newRev1, logger);
          setCollectionRevision(slug2, newRev2, logger);
        }
      } catch (err) {
        logger.error('Revision polling error:', err);
      }
    }, POLL_INTERVAL);
  }
};
