const logger = require('./logger');
const { getCollectionRevision, setCollectionRevision, loadState } = require('./revisionState');
const { getCollectionSlug, fetchRevision, processModFiles, computeDiff, findExclusiveChanges } = require('./nexusApi');
const { sendCombinedChangelogMessages, sendSingleChangelogMessages } = require('../services/changelogService');

const COLLECTIONS = [
  { name: 'ncr', compare: 'adr', channelId: '1285797113879334962' },
  { name: 'ncrlite', compare: 'adrlite', channelId: '1387411802035585086' }
];

module.exports = {
  async start(client) {
    const { updateCollectionVersionChannel, updateStatusChannel } = require('./voiceChannelUpdater');
    const { setRevision, getRevision, getRevertAt } = require('./revisionStore');
    const voiceConfig = require('../config/voiceChannels');

    const POLL_INTERVAL = 60 * 1000; // 60 seconds = 1 minute
    //const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes
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
        logger.debug("Polling for main collection revision...");
        const revisionData = await fetchRevision(
          MAIN_COLLECTION_SLUG,
          null,
          process.env.NEXUS_API_KEY,
          process.env.APP_NAME,
          process.env.APP_VERSION
        );
        const currentRevision = revisionData.revisionNumber;
        const lastRevision = await getRevision();

        logger.debug(`Fetched main collection revision: currentRevision=${currentRevision}, lastRevision=${lastRevision}`);

        if (!lastRevision || currentRevision > lastRevision) {
          logger.info(`Main revision change detected! Updating voice/status channels for revision ${currentRevision}`);
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
        } else {
          logger.debug("No main revision change detected.");
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

          logger.info(`[DEBUG] [${name}/${compare}] prevRev1=${prevRev1}, newRev1=${newRev1}, prevRev2=${prevRev2}, newRev2=${newRev2}`);

          // Only post if either collection has a new revision
          if ((prevRev1 && newRev1 > prevRev1) || (prevRev2 && newRev2 > prevRev2)) {
            logger.info(`[POST] [${name}/${compare}] Detected revision change. About to post changelog(s) to #${channelId}`);
            try {
              const channel = await client.channels.fetch(channelId);
              logger.debug(`[${name}/${compare}] Fetched Discord channel`);

              // Both collections updated
              if ((prevRev1 && newRev1 > prevRev1) && (prevRev2 && newRev2 > prevRev2)) {
                logger.info(`[POST] [${name}/${compare}] Both collections updated, calling sendCombinedChangelogMessages`);

                // --- BEGIN DIFF LOGIC ---
                const oldData1 = await fetchRevision(slug1, prevRev1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
                const newData1 = await fetchRevision(slug1, newRev1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
                const oldData2 = await fetchRevision(slug2, prevRev2, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
                const newData2 = await fetchRevision(slug2, newRev2, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);

                const oldMods1 = processModFiles(oldData1.modFiles);
                const newMods1 = processModFiles(newData1.modFiles);
                const oldMods2 = processModFiles(oldData2.modFiles);
                const newMods2 = processModFiles(newData2.modFiles);

                const diffs1 = computeDiff(oldMods1, newMods1);
                const diffs2 = computeDiff(oldMods2, newMods2);
                const exclusiveChanges = findExclusiveChanges(diffs1, diffs2);
                // --- END DIFF LOGIC ---

                await sendCombinedChangelogMessages(
                  channel,
                  diffs1, diffs2, exclusiveChanges,
                  slug1, prevRev1, newRev1,
                  slug2, prevRev2, newRev2
                );
                logger.info(`[DIFF-AUTO] Posted combined changelog for ${name}/${compare} in #${channelId}`);
              }
              // Only collection 1 updated
              else if (prevRev1 && newRev1 > prevRev1) {
                logger.info(`[POST] [${name}/${compare}] Only ${name} updated, calling sendSingleChangelogMessages`);

                // --- BEGIN DIFF LOGIC (SINGLE) ---
                const oldData1 = await fetchRevision(slug1, prevRev1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
                const newData1 = await fetchRevision(slug1, newRev1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
                const oldMods1 = processModFiles(oldData1.modFiles);
                const newMods1 = processModFiles(newData1.modFiles);
                const diffs1 = computeDiff(oldMods1, newMods1);
                // --- END DIFF LOGIC (SINGLE) ---

                await sendSingleChangelogMessages(
                  channel,
                  diffs1,
                  slug1, prevRev1, newRev1, name.toUpperCase()
                );
                logger.info(`[DIFF-AUTO] Posted single changelog for ${name} in #${channelId}`);
              }
              // Only collection 2 updated
              else if (prevRev2 && newRev2 > prevRev2) {
                logger.info(`[POST] [${name}/${compare}] Only ${compare} updated, calling sendSingleChangelogMessages`);

                // --- BEGIN DIFF LOGIC (SINGLE) ---
                const oldData2 = await fetchRevision(slug2, prevRev2, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
                const newData2 = await fetchRevision(slug2, newRev2, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
                const oldMods2 = processModFiles(oldData2.modFiles);
                const newMods2 = processModFiles(newData2.modFiles);
                const diffs2 = computeDiff(oldMods2, newMods2);
                // --- END DIFF LOGIC (SINGLE) ---

                await sendSingleChangelogMessages(
                  channel,
                  diffs2,
                  slug2, prevRev2, newRev2, compare.toUpperCase()
                );
                logger.info(`[DIFF-AUTO] Posted single changelog for ${compare} in #${channelId}`);
              }
            } catch (err) {
              logger.error(`[DIFF-AUTO] Failed to send changelog for ${name}/${compare}: ${err.stack || err}`);
            }
          } else {
            logger.info(`[SKIP] [${name}/${compare}] No revision change detected or no previous revision. (prevRev1: ${prevRev1}, newRev1: ${newRev1}, prevRev2: ${prevRev2}, newRev2: ${newRev2})`);
          }

          // Update stored revision numbers for next poll
          logger.debug(`[${name}/${compare}] Setting stored revision: slug1=${slug1}=${newRev1}, slug2=${slug2}=${newRev2}`);
          setCollectionRevision(slug1, newRev1, logger);
          setCollectionRevision(slug2, newRev2, logger);
        }
      } catch (err) {
        logger.error('Revision polling error:', err);
      }
    }, POLL_INTERVAL);
  }
};
