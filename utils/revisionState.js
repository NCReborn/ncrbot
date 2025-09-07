/**
 * Persistent storage of last known and last posted revisions per collection slug.
 * Keeps file small and simple (JSON). No concurrency issues expected at current scale.
 */
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'revisions.json');

let state = {
  collections: {
    // slug: { lastRevision: number, lastPostedRevision: number }
  }
};

function loadState(logger) {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      state = JSON.parse(raw);
      logger?.info?.('[revisionState] Loaded state file');
    }
  } catch (e) {
    logger?.error?.(`[revisionState] Failed to load state: ${e.message}`);
  }
}

function saveState(logger) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    logger?.error?.(`[revisionState] Failed to save state: ${e.message}`);
  }
}

function getCollectionRevision(slug) {
  return state.collections[slug]?.lastRevision || null;
}

function setCollectionRevision(slug, revision, logger) {
  if (!state.collections[slug]) state.collections[slug] = {};
  state.collections[slug].lastRevision = revision;
  saveState(logger);
}

function getLastPostedRevision(slug) {
  return state.collections[slug]?.lastPostedRevision || null;
}

function setLastPostedRevision(slug, revision, logger) {
  if (!state.collections[slug]) state.collections[slug] = {};
  state.collections[slug].lastPostedRevision = revision;
  saveState(logger);
}

module.exports = {
  loadState,
  getCollectionRevision,
  setCollectionRevision,
  getLastPostedRevision,
  setLastPostedRevision
};
