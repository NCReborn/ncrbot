require('dotenv').config();
const fs = require("fs");
const path = require("path");
const { collections } = require("../config/collections");
const { fetchCollectionMods } = require("../utils/collectionMods");
const { sendDiscordNotification } = require("../utils/discordNotify"); // <-- UNCOMMENTED

const MODS_STATE_FILE = path.resolve(__dirname, "../data/trackedMods.json");
const BATCH_SIZE = 75; // mods to check per run

// Get NCR collection slug from config
const NCR_COLLECTION = collections.find((c) => c.slug === "rcuccp");

// ... (loadTrackedMods, saveTrackedMods, loadCursor, saveCursor as before) ...

async function main() {
  if (!NCR_COLLECTION) {
    console.error("NCR collection not found in config.");
    process.exit(1);
  }
  // 1. Fetch current mods from collection
  const currentMods = await fetchCollectionMods(NCR_COLLECTION.slug);
  if (!currentMods || !currentMods.length) {
    console.error("No mods fetched for collection.");
    process.exit(1);
  }
  // 2. Load tracked mods state
  let tracked = loadTrackedMods();

  // 3. Sync: add new mods, remove old mods
  const currentIds = new Set(currentMods.map((m) => String(m.id)));
  for (const id in tracked) {
    if (!currentIds.has(id)) delete tracked[id];
  }
  currentMods.forEach((mod) => {
    if (!tracked[mod.id]) {
      tracked[mod.id] = {
        name: mod.name,
        lastKnownUpdate: null,
      };
    }
  });
  saveTrackedMods(tracked);

  // 4. Hourly batching
  const allIds = Object.keys(tracked);
  const batchCount = Math.ceil(allIds.length / BATCH_SIZE);
  let batchIdx = loadCursor();
  if (batchIdx >= batchCount) batchIdx = 0;

  const thisBatch = allIds.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);
  console.log(`Batch ${batchIdx + 1}/${batchCount}: Checking ${thisBatch.length} mods...`);

  // 5. Check for updates in this batch
  let updatedMods = [];
  for (const id of thisBatch) {
    // TODO: Replace with your actual Nexus API call to fetch mod info:
    // const modInfo = await fetchModDetails(id);
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
    const msg = updatedMods.map(
      m => `**${m.name}** (ID: ${m.id}) updated at ${m.newUpdate}`
    ).join("\n");
    await sendDiscordNotification(`:rotating_light: **Mod Updates Detected:**\n${msg}`);
    console.log("Updated mods:", updatedMods);
  } else {
    console.log("No updates found in this batch.");
  }
}

main().catch((err) => {
  console.error("Mod update checker error:", err);
  process.exit(1);
});
