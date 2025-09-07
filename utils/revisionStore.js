const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const DATA_FILE = path.join(__dirname, '../data/collection_state.json');

async function loadState() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    logger.error(`Failed to load collection state from ${DATA_FILE}: ${err.message}`);
    return { lastRevision: null, revertAt: null };
  }
}

async function saveState(state) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to save collection state to ${DATA_FILE}: ${err.message}`);
  }
}

async function setRevision(revision, revertAt = null) {
  const state = await loadState();
  state.lastRevision = revision;
  state.revertAt = revertAt;
  await saveState(state);
}

async function getRevision() {
  return (await loadState()).lastRevision;
}

async function getRevertAt() {
  return (await loadState()).revertAt;
}

module.exports = { setRevision, getRevision, getRevertAt, loadState, saveState };
