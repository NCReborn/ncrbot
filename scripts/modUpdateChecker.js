/**
 * Mod update checker for NCR collection.
 * - Syncs tracked mods with current collection state (adds/removes as needed)
 * - Splits work into hourly batches for rate limit safety
 * - Designed for use with an external scheduler (e.g., cron)
 * 
 * Fill in actual Nexus API calls where marked.
 */

const fs = require("fs");
const path = require("path");
const { collections } = require("../config/collections");
const { fetchCollectionMods } = require("../utils/collectionMods"); // you should implement or reuse this
// const { sendDiscordNotification } = require("../utils/discordNotify"); // implement as needed

const MODS_STATE_FILE = path.resolve(__dirname, "../data/trackedMods.json");
const BATCH_SIZE = 75; // mods to check per run

// Get NCR collection slug from config
const NCR_COLLECTION = collections.find((c) => c.slug === "rcuccp");

// Utility: load tracked mods state
function loadTrackedMods() {
  if (!fs.existsSync(MODS_STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(MODS_STATE_FILE, "utf8"));
}

// Utility: save tracked mods state
function saveTrackedMods(obj) {
  fs.writeFileSync(MODS_STATE_FILE, JSON.stringify(obj, null, 2));
}

// Utility: get current batch index (persisted)
function loadCursor() {
  const CURSOR_FILE = MODS_STATE_FILE.replace("trackedMods.json", "modCursor.json");
  if (!fs.existsSync(CURSOR_FILE)) return 0;
  return parseInt(fs.readFileSync(CURSOR_FILE, "utf8"), 10) || 0;
}
function saveCursor(idx) {
  const CURSOR_FILE = MODS_STATE_FILE.replace("trackedMods.json", "modCursor.json");
  fs.writeFileSync(CURSOR_FILE, String(idx));
}

// Main logic
async function main() {
  if (!NCR_COLLECTION) {
    console.error("NCR collection not found in config.");
    process.exit(1);
  }
  // 1. Fetch current mods from collection
  const currentMods = await fetchCollectionMods(NCR_COLLECTION.slug); // Should return array of { id, name, etc. }
  if (!currentMods || !currentMods.length) {
    console.error("No mods fetched for collection.");
    process.exit(1);
  }
  // 2. Load tracked mods state
  let tracked = loadTrackedMods();

  // 3. Sync: add new mods, remove old mods
  const currentIds = new Set(currentMods.map((m) => String(m.id)));
  // Remove mods no longer in collection
  for (const id in tracked) {
    if (!currentIds.has(id)) delete tracked[id];
  }
  // Add new mods
  currentMods.forEach((mod) => {
    if (!tracked[mod.id]) {
      tracked[mod.id] = {
        name: mod.name,
        lastKnownUpdate: null, // or mod.updatedAt if you want
        // ...any other fields you want to track
      };
    }
  });
  saveTrackedMods(tracked);

  // 4. Hourly batching
  const allIds = Object.keys(tracked);
  const batchCount = Math.ceil(allIds.length / BATCH_SIZE);
  let batchIdx = loadCursor();
  if (batchIdx >= batchCount) batchIdx = 0; // wrap around

  const thisBatch = allIds.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);
  console.log(`Batch ${batchIdx + 1}/${batchCount}: Checking ${thisBatch.length} mods...`);

  // 5. Check for updates in this batch
  let updatedMods = [];
  for (const id of thisBatch) {
    // TODO: Replace with your actual Nexus API call to fetch mod info:
    // const modInfo = await fetchModDetails(id);
    // For scaffold, fake:
    const modInfo = { updatedAt: new Date().toISOString() }; // stub, replace

    if (tracked[id].lastKnownUpdate !== modInfo.updatedAt) {
      updatedMods.push({ id, ...tracked[id], newUpdate: modInfo.updatedAt });
      tracked[id].lastKnownUpdate = modInfo.updatedAt;
    }
  }
  saveTrackedMods(tracked);
  saveCursor(batchIdx + 1);

  // 6. Notify if any mods updated
  if (updatedMods.length) {
    // TODO: Format and send to Discord mod-only channel
    // await sendDiscordNotification(updatedMods);
    console.log("Updated mods:", updatedMods);
  } else {
    console.log("No updates found in this batch.");
  }
}

// Entrypoint
main().catch((err) => {
  console.error("Mod update checker error:", err);
  process.exit(1);
});
