const logger = require('../utils/logger');
const { fetchRevision, processModFiles, computeDiff } = require('../utils/nexusApi');
const { getCollectionRevision, setCollectionRevision, loadState } = require('../utils/revisionState');
const collectionsConfig = require('../config/collections');
const changelogGenerator = require('./changelog/ChangelogGenerator');
const { updateCollectionVersionChannel, updateStatusChannel } = require('../utils/voiceChannelUpdater');
const voiceConfig = require('../config/voiceChannels');

// Delay helper
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class RevisionMonitor {
  constructor() {
    this.pollInterval = 15 * 60 * 1000; // 15 minutes
    this.pendingUpdates = new Map(); // Map<groupName, Array<updateInfo>>
    this.combineTimers = new Map(); // Map<groupName, timeoutId>
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

      // Update voice channels
      const guild = client.guilds.cache.first();
      if (guild) {
        const groupConfig = collectionsConfig.getGroupForCollection(slug);
        const gameVersion = groupConfig?.gameVersion || voiceConfig.defaultGameVersion;
        
        await updateCollectionVersionChannel(guild, gameVersion, currentRevision);
        await updateStatusChannel(guild, voiceConfig.statusJustUpdated, true);
      }

      await this.postChangelog(client, collection, {
        oldRev: previousRevision || 0,
        newRev: currentRevision,
        diffs
      });
    }
  }

  queueUpdate(client, collection, updateData) {
    const groupConfig = collectionsConfig.getGroupForCollection(collection.slug);
    
    if (!groupConfig) {
      logger.warn(`[REVISION_MONITOR] No group found for ${collection.display}`);
      return;
    }

    const groupName = groupConfig.name;

    // Initialize pending updates for this group if needed
    if (!this.pendingUpdates.has(groupName)) {
      this.pendingUpdates.set(groupName, []);
    }

    // Add update to pending queue
    const updateInfo = {
      collection,
      updateData
    };
    this.pendingUpdates.get(groupName).push(updateInfo);
    logger.info(`[REVISION_MONITOR] Queued update for ${collection.display} in group ${groupName}`);

    // Clear existing timer for this group (to restart the window)
    if (this.combineTimers.has(groupName)) {
      clearTimeout(this.combineTimers.get(groupName));
      logger.debug(`[REVISION_MONITOR] Reset combine window timer for group ${groupName}`);
    }

    // Only start timer if the group has combined mode enabled
    if (groupConfig.combined) {
      const timer = setTimeout(() => {
        this.processPendingGroup(client, groupName);
      }, collectionsConfig.combineWindowMs);
      
      this.combineTimers.set(groupName, timer);
      logger.info(`[REVISION_MONITOR] Started ${collectionsConfig.combineWindowMs / 1000}s combine window for group ${groupName}`);
    } else {
      setImmediate(() => {
        this.processPendingGroup(client, groupName);
      });
    }
  }

  async processPendingGroup(client, groupName) {
    // Clear timer
    if (this.combineTimers.has(groupName)) {
      clearTimeout(this.combineTimers.get(groupName));
      this.combineTimers.delete(groupName);
    }

    // Get pending updates
    const pendingUpdates = this.pendingUpdates.get(groupName);
    if (!pendingUpdates || pendingUpdates.length === 0) {
      logger.warn(`[REVISION_MONITOR] No pending updates for group ${groupName}`);
      return;
    }

    // Clear pending updates for this group
    this.pendingUpdates.delete(groupName);

    const groupConfig = collectionsConfig.getGroup(groupName);
    if (!groupConfig) {
      logger.error(`[REVISION_MONITOR] Group config not found for ${groupName}`);
      return;
    }

    logger.info(`[REVISION_MONITOR] Processing ${pendingUpdates.length} pending update(s) for group ${groupName}`);

    // Sort by collection priority (ensures Core → Extras → Body)
    pendingUpdates.sort((a, b) => {
      const priorityA = a.collection.priority || 0;
      const priorityB = b.collection.priority || 0;
      return priorityA - priorityB;
    });

    // ⭐ NEW LOGIC: Post each collection separately with a delay
    for (const update of pendingUpdates) {
      const { collection, updateData } = update;

      const revisionData = {
        collections: [
          {
            slug: collection.slug,
            display: collection.display,
            oldRev: updateData.oldRev,
            newRev: updateData.newRev
          }
        ],
        diffs: updateData.diffs
      };

      await changelogGenerator.sendChangelog(client, groupConfig, revisionData);

      // Wait 15 seconds before posting the next collection
      await wait(15000);
    }
  }

  async postChangelog(client, collection, updateData) {
    this.queueUpdate(client, collection, updateData);
  }
}

module.exports = new RevisionMonitor();
