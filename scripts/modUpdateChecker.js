const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Import the already-created client from index.js
const client = require('../index');

console.log('[DEBUG] Starting modUpdateChecker.js');

// Load your collections config and fetchCollectionMods utility
const { collections } = require('../config/collections');
const { fetchCollectionMods } = require('../utils/collectionMods');
const { fetchModDetails } = require('../utils/fetchModDetails');

const DATA_FILE = path.resolve(__dirname, '../data/trackedMods.json');
const REVISION_FILE = path.resolve(__dirname, '../data/collectionRevision.json');
const CURSOR_FILE = path.resolve(__dirname, '../data/modCursor.json');
const BATCH_SIZE = Math.ceil(900 / 24); // 900 mods, 24 runs (every 30min for 12h)
const CHANNEL_ID = '1419103241701949540'; // Replace with your channel ID

function loadTrackedMods() {
  console.log('[DEBUG] loadTrackedMods called');
  if (!fs.existsSync(DATA_FILE)) {
    console.log('[DEBUG] DATA_FILE does not exist');
    return {};
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function saveTrackedMods(obj) {
  console.log('[DEBUG] saveTrackedMods called');
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

function loadCollectionRevision() {
  console.log('[DEBUG] loadCollectionRevision called');
  if (!fs.existsSync(REVISION_FILE)) {
    console.log('[DEBUG] REVISION_FILE does not exist');
    return null;
  }
  return JSON.parse(fs.readFileSync(REVISION_FILE, 'utf8'));
}
function saveCollectionRevision(revision) {
  console.log('[DEBUG] saveCollectionRevision called');
  fs.writeFileSync(REVISION_FILE, JSON.stringify(revision, null, 2));
}

function loadCursor() {
  console.log('[DEBUG] loadCursor called');
  if (!fs.existsSync(CURSOR_FILE)) {
    console.log('[DEBUG] CURSOR_FILE does not exist');
    return 0;
  }
  return parseInt(fs.readFileSync(CURSOR_FILE, 'utf8'), 10) || 0;
}
function saveCursor(idx) {
  console.log('[DEBUG] saveCursor called');
  fs.writeFileSync(CURSOR_FILE, String(idx));
}

async function checkModsAndNotify(client) {
  console.log('[DEBUG] checkModsAndNotify called');

  const NCR_COLLECTION = collections.find((c) => c.slug === "rcuccp");
  if (!NCR_COLLECTION) {
    console.log('[DEBUG] NCR_COLLECTION not found');
    return;
  }
  console.log('[DEBUG] NCR_COLLECTION found:', NCR_COLLECTION);

  try {
    const result = await fetchCollectionMods(NCR_COLLECTION.slug);
    console.log('[DEBUG] fetchCollectionMods result:', result);
    if (!result) {
      console.log('[DEBUG] fetchCollectionMods returned undefined/null');
      return;
    }
    const { mods: currentMods, revision: currentRevision } = result;
    if (!currentMods || !currentMods.length) {
      console.log('[DEBUG] No mods returned by fetchCollectionMods');
      return;
    }
    console.log(`[DEBUG] ${currentMods.length} mods fetched, revision: ${currentRevision}`);

    let tracked = loadTrackedMods();
    let savedRevision = loadCollectionRevision();

    // Revision change: reset tracked mods, notify, reset cursor
    if (savedRevision !== currentRevision) {
      console.log('[DEBUG] Revision change detected or first run');
      const oldIds = new Set(Object.keys(tracked));
      const newIds = new Set(currentMods.map(m => String(m.id)));
      const removedMods = [...oldIds].filter(id => !newIds.has(id)).map(id => tracked[id]);
      const addedMods = currentMods.filter(m => !oldIds.has(String(m.id)));

      // Reset tracked mod state
      tracked = {};
      currentMods.forEach((mod) => {
        tracked[mod.id] = { name: mod.name, lastKnownUpdate: null };
      });
      saveTrackedMods(tracked);
      saveCollectionRevision(currentRevision);
      saveCursor(0);

      // Notify about revision update and mod adds/removes
      try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        let msg = `:bookmark_tabs: **Collection updated to revision ${currentRevision}.**\n`;
        if (removedMods.length > 0) {
          msg += `:no_entry: **Removed mods:**\n${removedMods.map(m => `- ${m.name} (ID: ${m.id})`).join('\n')}\n`;
        }
        if (addedMods.length > 0) {
          msg += `:white_check_mark: **Added mods:**\n${addedMods.map(m => `- ${m.name} (ID: ${m.id})`).join('\n')}\n`;
        }
        if (removedMods.length === 0 && addedMods.length === 0) {
          msg += `_No mods added or removed._`;
        }
        channel.send(msg);
        console.log('[DEBUG] Sent revision change message to channel');
      } catch (e) {
        console.error('[ERROR] Failed to send revision change message to Discord:', e);
      }
      return; // Skip update check this run
    }

    // Batching
    let batchIdx = loadCursor();
    const allIds = Object.keys(tracked);
    const batchCount = Math.ceil(allIds.length / BATCH_SIZE);
    if (batchIdx >= batchCount) batchIdx = 0;
    console.log(`[DEBUG] Batch index: ${batchIdx} of ${batchCount}, batch size: ${BATCH_SIZE}`);

    const thisBatch = allIds.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);
    saveCursor(batchIdx + 1);

    let updatedMods = [];
    for (const id of thisBatch) {
      try {
        const modInfo = await fetchModDetails(id);
        if (tracked[id].lastKnownUpdate !== modInfo.updatedAt) {
          updatedMods.push({ id, ...tracked[id], newUpdate: modInfo.updatedAt });
          tracked[id].lastKnownUpdate = modInfo.updatedAt;
          console.log(`[DEBUG] Mod updated: ${tracked[id].name} (${id}) at ${modInfo.updatedAt}`);
        }
      } catch (err) {
        console.error(`[ERROR] Failed to fetch mod ${id}:`, err);
      }
    }
    saveTrackedMods(tracked);

    // Notify if any mods updated
    if (updatedMods.length) {
      const msg = updatedMods.map(
        m => `**${m.name}** (ID: ${m.id}) updated at ${m.newUpdate}`
      ).join("\n");
      try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        channel.send(`:rotating_light: **Mod Updates Detected:**\n${msg}`);
        console.log('[DEBUG] Sent mod updates message to channel');
      } catch (e) {
        console.error('[ERROR] Failed to send mod updates message to Discord:', e);
      }
    } else {
      console.log('[DEBUG] No mods updated in this batch');
    }
  } catch (err) {
    console.error('[ERROR] Exception in checkModsAndNotify:', err);
  }
}

// Wait for the client to be ready before starting the cron job
client.once('ready', () => {
  console.log('[DEBUG] Discord client ready (modUpdateChecker)');
  // Run the check immediately on startup for testing
  checkModsAndNotify(client);

  // Every 30min (24 runs = 12h, adjust as needed)
  cron.schedule('*/30 * * * *', () => {
    console.log('[DEBUG] Running scheduled mod check');
    checkModsAndNotify(client);
  });
  console.log('Mod update cron started.');
});
