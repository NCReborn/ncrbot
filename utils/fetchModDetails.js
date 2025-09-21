const fetch = require('node-fetch');

// Set your Nexus Mods API key as an environment variable or hardcode for testing
const NEXUS_API_KEY = process.env.NEXUS_API_KEY;
const GAME_DOMAIN = 'cyberpunk2077';

/**
 * Fetch the details for a Nexus mod and return its updated time and name.
 * @param {string|number} modId - The mod ID to fetch.
 * @returns {Promise<{updatedAt: string, name: string}>}
 */
async function fetchModDetails(modId) {
  if (!NEXUS_API_KEY) {
    throw new Error("Nexus Mods API key is not set. Please set NEXUS_API_KEY environment variable.");
  }
  const url = `https://api.nexusmods.com/v1/games/${GAME_DOMAIN}/mods/${modId}.json`;
  const headers = {
    'apikey': NEXUS_API_KEY,
    'accept': 'application/json'
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch mod details for mod ${modId}: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // updated_time format: "2024-06-01T16:02:08+00:00"
  return {
    updatedAt: data.updated_time,
    name: data.name
  };
}

module.exports = { fetchModDetails };
