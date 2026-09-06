// services/CollectionHealthService.js
//
// Checks a tracked collection's bundled mod versions against each mod's
// current version on Nexus, spread across many small batches instead of
// one big sweep -- a collection can have 900+ mods, and checking every
// one individually against Nexus's REST API in a single run would blow
// through rate limits (~100 req/hour on a standard key). Instead this
// runs on an hourly cron (see events/ready.js), checking a slice of the
// collection's mod list each time, sized so a full sweep finishes in
// roughly a day regardless of collection size.
//
// State persists to data/collectionHealth.json between runs, keyed by
// guild + collection slug, so progress survives a bot restart mid-sweep.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

const STATE_PATH = path.join(__dirname, '..', 'data', 'collectionHealth.json');
const SWEEP_HOURS = 24;
const MIN_BATCH_SIZE = 5;

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (err) {
    logger.error(`[COLLECTION_HEALTH] Failed to parse state: ${err.message}`);
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function getSweep(state, guildId, slug) {
  if (!state[guildId]) state[guildId] = {};
  return state[guildId][slug] || null;
}

function setSweep(state, guildId, slug, sweep) {
  if (!state[guildId]) state[guildId] = {};
  state[guildId][slug] = sweep;
}

// Fetches one mod's current info from Nexus. Returns null (rather than
// throwing) on failure so one bad mod doesn't abort the whole batch --
// the caller just skips it and it gets retried on the next sweep.
async function fetchModInfo(domainName, modId, apiKey, appName, appVersion) {
  const url = `https://api.nexusmods.com/v1/games/${domainName}/mods/${modId}.json`;
  try {
    const res = await axios.get(url, {
      headers: {
        apikey: apiKey,
        'Application-Name': appName,
        'Application-Version': appVersion
      },
      timeout: 10000
    });
    return {
      version: res.data.version,
      status: res.data.status // 'published', 'not_published', 'hidden', 'removed', ...
    };
  } catch (err) {
    logger.warn(`[COLLECTION_HEALTH] Failed to fetch mod ${domainName}/${modId}: ${err.message}`);
    return null;
  }
}

// Lets the caller skip fetching modFiles from Nexus when it wouldn't be
// used anyway -- only needed to start a brand new sweep.
function hasActiveSweep(guildId, slug) {
  const state = loadState();
  const sweep = getSweep(state, guildId, slug);
  return Boolean(sweep && (sweep.queue.length > 0 || sweep.totalMods > 0));
}

// Starts a fresh sweep from a collection's currently bundled mod list.
function startSweep(modFiles) {
  const queue = modFiles
    .filter((mf) => mf.file && mf.file.mod)
    .map((mf) => ({
      modId: mf.file.mod.modId,
      domainName: mf.file.mod.game.domainName,
      name: mf.file.mod.name,
      bundledVersion: mf.file.version
    }));

  return {
    queue,
    totalMods: queue.length,
    results: [],
    sweepStartedAt: new Date().toISOString()
  };
}

/**
 * Runs one batch of a guild+collection's health sweep. Starts a new sweep
 * automatically if none is in progress. Returns { done: false } if the
 * sweep isn't finished yet, or { done: true, results, totalMods } once
 * every mod in the collection has been checked -- caller is responsible
 * for posting/using the report and NOT calling this again until it wants
 * a fresh sweep to start (call resetSweep() first).
 *
 * @param {string} guildId
 * @param {string} slug            Collection slug.
 * @param {object[]} modFiles      Only needed to start a new sweep -- pass
 *   the latest collectionRevision's modFiles (e.g. from RevisionMonitor's
 *   existing fetchRevision call). Ignored if a sweep is already in progress.
 * @param {object} nexusCreds      { apiKey, appName, appVersion }
 */
async function runBatch(guildId, slug, modFiles, nexusCreds) {
  const state = loadState();
  let sweep = getSweep(state, guildId, slug);

  if (!sweep || sweep.queue.length === 0 && sweep.totalMods === 0) {
    sweep = startSweep(modFiles);
    setSweep(state, guildId, slug, sweep);
  }

  if (sweep.queue.length === 0) {
    // Sweep already fully checked but not yet collected by the caller.
    return { done: true, results: sweep.results, totalMods: sweep.totalMods };
  }

  const batchSize = Math.max(MIN_BATCH_SIZE, Math.ceil(sweep.totalMods / SWEEP_HOURS));
  const batch = sweep.queue.splice(0, batchSize);

  for (const mod of batch) {
    const info = await fetchModInfo(mod.domainName, mod.modId, nexusCreds.apiKey, nexusCreds.appName, nexusCreds.appVersion);
    if (!info) continue; // couldn't check it this time, drop silently -- next full sweep will retry

    sweep.results.push({
      name: mod.name,
      modId: mod.modId,
      domainName: mod.domainName,
      bundledVersion: mod.bundledVersion,
      latestVersion: info.version,
      outdated: Boolean(info.version) && info.version !== mod.bundledVersion,
      unavailable: info.status !== 'published'
    });
  }

  setSweep(state, guildId, slug, sweep);
  saveState(state);

  if (sweep.queue.length === 0) {
    return { done: true, results: sweep.results, totalMods: sweep.totalMods };
  }

  return { done: false, checkedSoFar: sweep.results.length, totalMods: sweep.totalMods };
}

// Clears a guild+collection's sweep so the next runBatch() call starts
// fresh -- call after consuming a { done: true } result.
function resetSweep(guildId, slug) {
  const state = loadState();
  if (state[guildId]) {
    delete state[guildId][slug];
  }
  saveState(state);
}

// Formats a capped list of "Name (vBundled -> vLatest)" lines, adding a
// "+N more" line rather than letting the field grow unbounded -- Discord
// embed fields cap at 1024 characters.
function formatModList(mods, formatter, cap = 20) {
  const shown = mods.slice(0, cap).map(formatter);
  if (mods.length > cap) {
    shown.push(`*+${mods.length - cap} more*`);
  }
  return shown.join('\n') || 'None';
}

function buildHealthReportEmbed(collectionDisplay, results) {
  const outdated = results.filter((r) => r.outdated && !r.unavailable);
  const unavailable = results.filter((r) => r.unavailable);
  const healthy = results.length - outdated.length - unavailable.length;

  const embed = new EmbedBuilder()
    .setTitle(`🩺 Collection Health Report — ${collectionDisplay}`)
    .setColor(outdated.length + unavailable.length > 0 ? 0xffa52e : 0x78ffa0)
    .setDescription(
      `Checked **${results.length}** mods against their current Nexus listing.\n` +
      `✅ ${healthy} up to date · 🔄 ${outdated.length} outdated · ⚠️ ${unavailable.length} unavailable`
    )
    .setTimestamp();

  if (outdated.length > 0) {
    embed.addFields({
      name: '🔄 Outdated (bundled → latest)',
      value: formatModList(outdated, (m) => `[${m.name}](https://www.nexusmods.com/${m.domainName}/mods/${m.modId}) (${m.bundledVersion} → ${m.latestVersion})`)
    });
  }

  if (unavailable.length > 0) {
    embed.addFields({
      name: '⚠️ No longer published on Nexus',
      value: formatModList(unavailable, (m) => `[${m.name}](https://www.nexusmods.com/${m.domainName}/mods/${m.modId})`)
    });
  }

  return embed;
}

module.exports = { runBatch, resetSweep, buildHealthReportEmbed, hasActiveSweep };
