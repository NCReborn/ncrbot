const fetch = require('node-fetch');

// Set your Nexus Mods API key in your environment, or paste it here for testing.
const NEXUS_API_KEY = process.env.NEXUS_API_KEY; // or 'your-api-key-here'
const GAME_DOMAIN = 'cyberpunk2077';
const COLLECTION_SLUG = 'rcuccp';

/**
 * Fetches mods and the current revision for a Nexus Mods collection.
 * Returns: { mods: [ { id, name }, ... ], revision: <number> }
 */
async function fetchCollectionMods(slug = COLLECTION_SLUG) {
  const url = `https://api.nexusmods.com/v1/collections/${GAME_DOMAIN}/${slug}/latest`;
  const headers = {
    'apikey': NEXUS_API_KEY,
    'accept': 'application/json'
  };

  console.log('[fetchCollectionMods] URL:', url);
  console.log('[fetchCollectionMods] Headers:', headers);

  const res = await fetch(url, { headers });
  console.log('[fetchCollectionMods] Status:', res.status, res.statusText);

  if (!res.ok) {
    let errorBody = '';
    try {
      errorBody = await res.text();
    } catch (e) {
      errorBody = '[Error reading body]';
    }
    console.error(`[fetchCollectionMods] Error response body: ${errorBody}`);
    throw new Error(`Failed to fetch collection: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  console.log('[fetchCollectionMods] Data:', JSON.stringify(data, null, 2));

  // Parse revision and mods
  const revision = data.revision_number || data.revision || null;
  const mods = (data.mods || []).map(mod => ({
    id: String(mod.mod_id),
    name: mod.name
  }));

  return { mods, revision };
}

module.exports = { fetchCollectionMods };
