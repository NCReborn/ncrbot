const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit').default; // <-- CORRECT import for p-limit v4+

const CATEGORY_CACHE_PATH = path.join(__dirname, 'modCategoryCache.json');
const RATE_LIMIT = 30; // Nexus Mods API rate limit per minute
const BATCH_DELAY_MS = 60 * 1000; // 1 minute pause
const REQUEST_DELAY_MS = 1500; // 1.5s per request (extra safety)
const CONCURRENCY = 2; // Requests in parallel

function loadCategoryCache() {
  if (fs.existsSync(CATEGORY_CACHE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CATEGORY_CACHE_PATH, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveCategoryCache(cache) {
  fs.writeFileSync(CATEGORY_CACHE_PATH, JSON.stringify(cache, null, 2));
}

let debugLogged = false;
async function fetchModCategory(domainName, modId, apiKey, cache) {
  const cacheKey = `${modId}:${domainName}`;
  if (cache[cacheKey]) return cache[cacheKey];

  const url = `https://api.nexusmods.com/v1/games/${domainName}/mods/${modId}.json`;
  try {
    const res = await fetch(url, {
      headers: { apikey: apiKey, "Accept": "application/json" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Log the first response for debugging
    if (!debugLogged) {
      console.log('MOD RESPONSE:', JSON.stringify(data, null, 2));
      debugLogged = true;
    }

    // Try common category fields
    let category = "Other";
    if (data.category_name) {
      category = data.category_name;
    } else if (Array.isArray(data.categories) && data.categories.length > 0 && data.categories[0].name) {
      category = data.categories[0].name;
    } else if (data.category && typeof data.category === "string") {
      category = data.category;
    }

    cache[cacheKey] = category;
    saveCategoryCache(cache);
    return category;
  } catch (e) {
    cache[cacheKey] = "Other";
    saveCategoryCache(cache);
    return "Other";
  }
}

/**
 * Enrich mods with categories, respecting rate limits and updating admin channel with progress.
 * @param {Array} modList - Array of mod objects needing category enrichment.
 * @param {string} apiKey - Nexus Mods API key.
 * @param {Discord.TextChannel} adminChannel - Discord.js channel object for progress/status.
 * @returns {Array} - Array of mods with .category property.
 */
async function enrichModsWithCategoryAndProgress(modList, apiKey, adminChannel) {
  const cache = loadCategoryCache();
  const totalMods = modList.length;
  let processed = 0;

  // Estimate time (round up for batches)
  const batches = Math.ceil(totalMods / RATE_LIMIT);
  const estimatedTime = Math.ceil((batches * BATCH_DELAY_MS + totalMods * REQUEST_DELAY_MS) / 60000);

  // Send initial progress message
  let statusMsg = await adminChannel.send(
    `🟡 Starting changelog enrichment: **${totalMods} mods** to process.\nEstimated time: ~${estimatedTime} minutes.`
  );

  const limit = pLimit(CONCURRENCY);
  const enrichedMods = [];
  for (let batchStart = 0; batchStart < totalMods; batchStart += RATE_LIMIT) {
    const batch = modList.slice(batchStart, batchStart + RATE_LIMIT);

    // Process this batch with concurrency limit
    const batchResults = await Promise.all(batch.map(mod =>
      limit(async () => {
        mod.category = await fetchModCategory(mod.domainName, mod.modId, apiKey, cache);
        processed++;
        // Update progress every 5 mods or end
        if (processed % 5 === 0 || processed === totalMods) {
          const timeLeft = Math.ceil(
            ((totalMods - processed) * REQUEST_DELAY_MS + (batches - Math.ceil(processed / RATE_LIMIT)) * BATCH_DELAY_MS) / 60000
          );
          await statusMsg.edit(
            `🟡 Changelog enrichment progress: **${processed}/${totalMods} mods** processed.\nEstimated time left: ~${timeLeft} minutes.`
          );
        }
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        return mod;
      })
    ));
    enrichedMods.push(...batchResults);

    // If more batches to go, pause for rate limit
    if (batchStart + RATE_LIMIT < totalMods) {
      await statusMsg.edit(
        `⏸️ Rate limit hit: Pausing for 1 minute. Progress: **${processed}/${totalMods} mods**.`
      );
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  await statusMsg.edit(`🟢 Changelog enrichment complete! Processed **${totalMods} mods**. Publishing changelog...`);
  return enrichedMods;
}

module.exports = { enrichModsWithCategoryAndProgress };
