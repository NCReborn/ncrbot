/**
 * Persistent storage of last known and last posted revisions
 * per guild and per collection slug.
 *
 * Structure:
 * {
 *   "<guildId>": {
 *     "collections": {
 *       "<slug>": {
 *         "lastRevision": number,
 *         "lastPostedRevision": number
 *       }
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'revisions.json');

let state = {};

/**
 * Ensure the file exists and load it.
 */
function loadState(logger) {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      state = JSON.parse(raw);
      logger?.info?.('[revisionState] Loaded state file');
    } else {
      state = {};
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      logger?.info?.('[revisionState] Created new state file');
    }
  } catch (e) {
    logger?.error?.(`[revisionState] Failed to load state: ${e.message}`);
    state = {};
  }
}

/**
 * Save the entire state to disk.
 */
function saveState(logger) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    logger?.info?.('[revisionState] Saved state file');
  } catch (e) {
    logger?.error?.(`[revisionState] Failed to save state: ${e.message}`);
  }
}

/**
 * Ensure guild + collection objects exist.
 */
function ensureGuildCollection(guildId, slug) {
  if (!state[guildId]) state[guildId] = { collections: {} };
  if (!state[guildId].collections[slug]) {
    state[guildId].collections[slug] = {
      lastRevision: null,
      lastPostedRevision: null
    };
  }
}

/**
 * Get last known revision for a guild + slug.
 */
function getCollectionRevision(guildId, slug) {
  ensureGuildCollection(guildId, slug);
  return state[guildId].collections[slug].lastRevision;
}

/**
 * Set last known revision for a guild + slug.
 */
function setCollectionRevision(guildId, slug, revision, logger) {
  ensureGuildCollection(guildId, slug);
  state[guildId].collections[slug].lastRevision = revision;
  saveState(logger);
}

/**
 * Get last posted revision for a guild + slug.
 */
function getLastPostedRevision(guildId, slug) {
  ensureGuildCollection(guildId, slug);
  return state[guildId].collections[slug].lastPostedRevision;
}

/**
 * Set last posted revision for a guild + slug.
 */
function setLastPostedRevision(guildId, slug, revision, logger) {
  ensureGuildCollection(guildId, slug);
  state[guildId].collections[slug].lastPostedRevision = revision;
  saveState(logger);
}

module.exports = {
  loadState,
  saveState,
  getCollectionRevision,
  setCollectionRevision,
  getLastPostedRevision,
  setLastPostedRevision
};
