const logger = require('../utils/logger');
const { fetchRevision, processModFiles, computeDiff } = require('../utils/nexusApi');
const { getCollectionRevision, setCollectionRevision, loadState } = require('../utils/revisionState');
const collectionsConfig = require('../config/collections');
const changelogGenerator = require('./changelog/ChangelogGenerator');

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
      // Start new combine window timer
      const timer = setTimeout(() => {
        this.processPendingGroup(client, groupName);
      }, collectionsConfig.combineWindowMs);
      
      this.combineTimers.set(groupName, timer);
      logger.info(`[REVISION_MONITOR] Started ${collectionsConfig.combineWindowMs / 1000}s combine window for group ${groupName}`);
    } else {
      // If not combined mode, process immediately (use setImmediate to avoid blocking)
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

    // Sort by collection priority (if available)
    pendingUpdates.sort((a, b) => {
      const priorityA = a.collection.priority || 0;
      const priorityB = b.collection.priority || 0;
      return priorityA - priorityB;
    });

    // Build collections array and merge diffs
    const collections = pendingUpdates.map(update => ({
      slug: update.collection.slug,
      display: update.collection.display,
      oldRev: update.updateData.oldRev,
      newRev: update.updateData.newRev
    }));

    const diffsArray = pendingUpdates.map(update => update.updateData.diffs);
    const mergedDiffs = this.mergeDiffs(diffsArray);

    const revisionData = {
      collections,
      diffs: mergedDiffs
    };

    await changelogGenerator.sendChangelog(client, groupConfig, revisionData);
  }

  mergeDiffs(diffsArray) {
    const mergedAdded = [];
    const mergedRemoved = [];
    const mergedUpdated = [];

    const addedMap = new Map();
    const removedMap = new Map();
    const updatedMap = new Map();

    // Merge all diffs, deduplicating by mod id
    for (const diffs of diffsArray) {
      // Merge added mods
      if (diffs.added) {
        for (const mod of diffs.added) {
          if (!addedMap.has(mod.id)) {
            addedMap.set(mod.id, mod);
          }
        }
      }

      // Merge removed mods
      if (diffs.removed) {
        for (const mod of diffs.removed) {
          if (!removedMap.has(mod.id)) {
            removedMap.set(mod.id, mod);
          }
        }
      }

      // Merge updated mods
      if (diffs.updated) {
        for (const update of diffs.updated) {
          const modId = update.before.id;
          if (!updatedMap.has(modId)) {
            updatedMap.set(modId, update);
          } else {
            // If already exists, keep the one with the most recent version change
            const existing = updatedMap.get(modId);
            if (update.after.version > existing.after.version) {
              updatedMap.set(modId, update);
            }
          }
        }
      }
    }

    // Convert Maps back to arrays
    mergedAdded.push(...addedMap.values());
    mergedRemoved.push(...removedMap.values());
    mergedUpdated.push(...updatedMap.values());

    return {
      added: mergedAdded,
      removed: mergedRemoved,
      updated: mergedUpdated
    };
  }

  async postChangelog(client, collection, updateData) {
    // Delegate to queueUpdate for consistency
    this.queueUpdate(client, collection, updateData);
  }
}

module.exports = new RevisionMonitor();
