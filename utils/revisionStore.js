const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '../data/collection_state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { lastRevision: null, revertAt: null };
  }
}

function saveState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function setRevision(revision, revertAt = null) {
  const state = loadState();
  state.lastRevision = revision;
  state.revertAt = revertAt;
  saveState(state);
}

function getRevision() {
  return loadState().lastRevision;
}

function getRevertAt() {
  return loadState().revertAt;
}

module.exports = { setRevision, getRevision, getRevertAt, loadState, saveState };
