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

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch collection: ${res.statusText}`);
  }
  const data = await res.json();

  // Parse revision and mods
  const revision = data.revision_number || data.revision || null;
  const mods = (data.mods || []).map(mod => ({
    id: String(mod.mod_id),
    name: mod.name
  }));

  return { mods, revision };
}

module.exports = { fetchCollectionMods };
