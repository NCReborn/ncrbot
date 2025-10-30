const axios = require('axios');
const { COLLECTION_MAPPINGS } = require('../config/constants');
const logger = require('./logger');

const API_URL = 'https://api-router.nexusmods.com/graphql';

async function fetchRevision(slug, revision, apiKey, appName, appVersion) {
  const query = `
    query Revision($slug: String!, $revision: Int) {
      collectionRevision(slug: $slug, revision: $revision, viewAdultContent: true) {
        revisionNumber
        modFiles {
          fileId
          optional
          file {
            fileId
            name
            version
            mod {
              modId
              name
              game {
                name
                domainName
              }
            }
          }
        }
      }
    }
  `;
  
  const variables = { slug, revision };
  const headers = {
    'Content-Type': 'application/json',
    apikey: apiKey,
    'Application-Name': appName,
    'Application-Version': appVersion,
  };

  try {
    const response = await axios.post(API_URL, { query, variables }, { headers, timeout: 10000 });
    
    if (response.data.errors) {
      const errorMessage = response.data.errors.map(error => error.message).join(', ');
      logger.error(`Nexus API error (GraphQL errors): ${errorMessage}`);
      throw new Error(`API Error: ${errorMessage}`);
    }
    
    if (!response.data.data || !response.data.data.collectionRevision) {
      logger.error(`Nexus API error: Revision ${revision} not found for collection ${slug}`);
      throw new Error(`Revision ${revision} not found for collection ${slug}`);
    }

    // DEBUG: Log revision and modFiles count
    const modFiles = response.data.data.collectionRevision.modFiles || [];
    // logger.debug(`[fetchRevision] ${slug} rev ${revision}: found ${modFiles.length} modFiles`);
    // Optionally uncomment this for full raw modFiles:
    // logger.debug(`[fetchRevision] ${slug} rev ${revision} modFiles: ${JSON.stringify(modFiles)}`);
    
    return response.data.data.collectionRevision;
  } catch (error) {
    if (error.response) {
      logger.error(`Nexus API error: Status ${error.response.status} - ${error.response.statusText}`);
      throw new Error(`API returned status ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      logger.error('Nexus API error: No response received from Nexus Mods API.');
      throw new Error('No response received from Nexus Mods API. Please try again later.');
    } else {
      logger.error(`Nexus API error: ${error.message}`);
      throw new Error(`Failed to fetch revision: ${error.message}`);
    }
  }
}

function getCollectionSlug(name) {
  const normalizedName = name.toLowerCase().trim();
  return COLLECTION_MAPPINGS.slugs[normalizedName] || name;
}

function getCollectionName(slug) {
  return COLLECTION_MAPPINGS.names[slug] || slug;
}

function computeDiff(oldMods, newMods) {
  const oldMap = new Map(oldMods.map((m) => [String(m.id), m]));
  const newMap = new Map(newMods.map((m) => [String(m.id), m]));

  const added = [];
  const removed = [];
  const updated = [];

  for (const [id, mod] of newMap.entries()) {
    if (!oldMap.has(id)) {
      added.push(mod);
    } else {
      const oldMod = oldMap.get(id);
      if (oldMod.version !== mod.version) {
        updated.push({ before: oldMod, after: mod });
      }
    }
  }

  for (const [id, mod] of oldMap.entries()) {
    if (!newMap.has(id)) {
      removed.push(mod);
    }
  }

  return { added, removed, updated };
}

function findExclusiveChanges(diffs1, diffs2) {
  const exclusiveAdded1 = diffs1.added.filter(mod1 => !diffs2.added.some(mod2 => mod2.id === mod1.id));
  const exclusiveRemoved1 = diffs1.removed.filter(mod1 => !diffs2.removed.some(mod2 => mod2.id === mod1.id));
  const exclusiveUpdated1 = diffs1.updated.filter(update1 => !diffs2.updated.some(update2 => update2.before.id === update1.before.id));

  const exclusiveAdded2 = diffs2.added.filter(mod2 => !diffs1.added.some(mod1 => mod1.id === mod2.id));
  const exclusiveRemoved2 = diffs2.removed.filter(mod2 => !diffs1.removed.some(mod1 => mod1.id === mod2.id));
  const exclusiveUpdated2 = diffs2.updated.filter(update2 => !diffs1.updated.some(update1 => update1.before.id === update2.before.id));

  return {
    added1: exclusiveAdded1,
    removed1: exclusiveRemoved1,
    updated1: exclusiveUpdated1,
    added2: exclusiveAdded2,
    removed2: exclusiveRemoved2,
    updated2: exclusiveUpdated2
  };
}

function processModFiles(modFiles) {
  const mods = modFiles
    .filter((mf) => mf.file && mf.file.mod)
    .map((mf) => ({
      id: `${mf.file.mod.modId}-${mf.file.mod.game.domainName}`,
      name: mf.file.mod.name,
      version: mf.file.version,
      domainName: mf.file.mod.game.domainName,
      modId: mf.file.mod.modId,
    }));
  logger.debug(`[processModFiles] Processed ${mods.length} mods: ${JSON.stringify(mods)}`);
  return mods;
}

module.exports = {
  fetchRevision,
  getCollectionSlug,
  getCollectionName,
  computeDiff,
  findExclusiveChanges,
  processModFiles
};
