const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { Client, GatewayIntentBits } = require('discord.js');

// Load your collections config and fetchCollectionMods utility
const { collections } = require('./config/collections');
const { fetchCollectionMods } = require('./utils/collectionMods');

const DATA_FILE = path.resolve(__dirname, './data/trackedMods.json');
const REVISION_FILE = path.resolve(__dirname, './data/collectionRevision.json');
const CURSOR_FILE = path.resolve(__dirname, './data/modCursor.json');
const BATCH_SIZE = Math.ceil(900 / 24); // 900 mods, 24 runs (every 30min for 12h)
const CHANNEL_ID = '1419103241701949540'; // Replace with your channel ID

function loadTrackedMods() {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function saveTrackedMods(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

function loadCollectionRevision() {
  if (!fs.existsSync(REVISION_FILE)) return null;
  return JSON.parse(fs.readFileSync(REVISION_FILE, 'utf8'));
}
function saveCollectionRevision(revision) {
  fs.writeFileSync(REVISION_FILE, JSON.stringify(revision, null, 2));
}

function loadCursor() {
  if (!fs.existsSync(CURSOR_FILE)) return 0;
  return parseInt(fs.readFileSync(CURSOR_FILE, 'utf8'), 10) || 0;
}
function saveCursor(idx) {
  fs.writeFileSync(CURSOR_FILE, String(idx));
}

async function checkModsAndNotify(client) {
  const NCR_COLLECTION = collections.find((c) => c.slug === "rcuccp");
  if (!NCR_COLLECTION) return;

  // fetchCollectionMods should return { mods: [...], revision: <number> }
  const { mods: currentMods, revision: currentRevision } = await fetchCollectionMods(NCR_COLLECTION.slug);
  if (!currentMods || !currentMods.length) return;

  let tracked = loadTrackedMods();
  let savedRevision = loadCollectionRevision();

  // Revision change: reset tracked mods, notify, reset cursor
  if (savedRevision !== currentRevision) {
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
    return; // Skip update check this run
  }

  // Batching
  let batchIdx = loadCursor();
  const allIds = Object.keys(tracked);
  const batchCount = Math.ceil(allIds.length / BATCH_SIZE);
  if (batchIdx >= batchCount) batchIdx = 0;

  const thisBatch = allIds.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);
  saveCursor(batchIdx + 1);

  let updatedMods = [];
  for (const id of thisBatch) {
    // Replace with your actual Nexus API call for mod details:
    // const modInfo = await fetchModDetails(id);
    const modInfo = { updatedAt: new Date().toISOString() }; // stub

    if (tracked[id].lastKnownUpdate !== modInfo.updatedAt) {
      updatedMods.push({ id, ...tracked[id], newUpdate: modInfo.updatedAt });
      tracked[id].lastKnownUpdate = modInfo.updatedAt;
    }
  }
  saveTrackedMods(tracked);

  // Notify if any mods updated
  if (updatedMods.length) {
    const msg = updatedMods.map(
      m => `**${m.name}** (ID: ${m.id}) updated at ${m.newUpdate}`
    ).join("\n");
    const channel = await client.channels.fetch(CHANNEL_ID);
    channel.send(`:rotating_light: **Mod Updates Detected:**\n${msg}`);
  }
}

// Example Discord bot integration
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  // Run the check immediately on startup for testing
  checkModsAndNotify(client);

  // Every 30min (24 runs = 12h, adjust as needed)
  cron.schedule('*/30 * * * *', () => checkModsAndNotify(client));
  console.log('Mod update cron started.');
});

client.login('YOUR_DISCORD_BOT_TOKEN');
