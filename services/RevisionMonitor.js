const logger = require('../utils/logger');
const { fetchRevision, processModFiles, computeDiff } = require('../utils/nexusApi');
const { getCollectionRevision, setCollectionRevision, loadState } = require('../utils/revisionState');
const collectionsConfig = require('../config/collections');
const changelogGenerator = require('./changelog/ChangelogGenerator');

class RevisionMonitor {
  constructor() {
    this.pollInterval = 15 * 60 * 1000; // 15 minutes
  }

  async start(client) {
    logger.info('[REVISION_MONITOR] Starting...');
    
    loadState(logger);

    // Poll immediately
    await this.checkAllCollections(client);

    // Then poll every 15 minutes
    setInterval(async () => {
      await this.checkAllCollections(client);
    }, this.pollInterval);
  }

  async checkAllCollections(client) {
    logger.debug('[REVISION_MONITOR] Checking for updates...');

    for (const collection of collectionsConfig.collections) {
      try {
        await this.checkCollection(client, collection);
      } catch (error) {
        logger.error(`[REVISION_MONITOR] Error checking ${collection.display}:`, error);
      }
    }
  }

  async checkCollection(client, collection) {
    const { slug, display } = collection;

    const revisionData = await fetchRevision(
      slug,
      null,
      process.env.NEXUS_API_KEY,
      process.env.APP_NAME,
      process.env.APP_VERSION
    );

    const currentRevision = revisionData.revisionNumber;
    const previousRevision = getCollectionRevision(slug);

    if (!previousRevision || currentRevision > previousRevision) {
      logger.info(`[REVISION_MONITOR] New revision: ${display} (${previousRevision} → ${currentRevision})`);

      const newMods = processModFiles(revisionData.modFiles);
      let oldMods = [];
      
      if (previousRevision) {
        const oldRevisionData = await fetchRevision(
          slug,
          previousRevision,
          process.env.NEXUS_API_KEY,
          process.env.APP_NAME,
          process.env.APP_VERSION
        );
        oldMods = processModFiles(oldRevisionData.modFiles);
      }

      const diffs = computeDiff(oldMods, newMods);

      setCollectionRevision(slug, currentRevision);

      await this.postChangelog(client, collection, {
        oldRev: previousRevision || 0,
        newRev: currentRevision,
        diffs
      });
    }
  }

  async postChangelog(client, collection, updateData) {
    const groupConfig = collectionsConfig.getGroupForCollection(collection.slug);
    
    if (!groupConfig) {
      logger.warn(`[REVISION_MONITOR] No group found for ${collection.display}`);
      return;
    }

    const revisionData = {
      collections: [{
        slug: collection.slug,
        display: collection.display,
        oldRev: updateData.oldRev,
        newRev: updateData.newRev
      }],
      diffs: updateData.diffs
    };

    await changelogGenerator.sendChangelog(client, groupConfig, revisionData);
  }
}

module.exports = new RevisionMonitor();
