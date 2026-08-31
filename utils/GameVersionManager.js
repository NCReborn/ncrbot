// utils/GameVersionManager.js
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const VERSION_FILE = path.join(__dirname, '../data/gameVersions.json');

// Ensure file + directory exist
function ensureFile() {
  const dir = path.dirname(VERSION_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(VERSION_FILE)) {
    fs.writeFileSync(VERSION_FILE, JSON.stringify({}, null, 2));
  }
}

function loadVersions() {
  try {
    ensureFile();
    const raw = fs.readFileSync(VERSION_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    logger.error('[GameVersionManager] Failed to load game versions:', error);
    return {};
  }
}

function saveVersions(versions) {
  try {
    ensureFile();
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versions, null, 2));
  } catch (error) {
    logger.error('[GameVersionManager] Failed to save game versions:', error);
  }
}

/**
 * Get the game version for a specific guild + collection slug.
 * Falls back to "1.0" if not set.
 */
function getVersion(guildId, slug) {
  const versions = loadVersions();

  if (!versions[guildId]) return '1.0';
  return versions[guildId][slug] || '1.0';
}

/**
 * Set the game version for a specific guild + collection slug.
 */
function setVersion(guildId, slug, version) {
  const versions = loadVersions();

  if (!versions[guildId]) versions[guildId] = {};
  versions[guildId][slug] = version;

  saveVersions(versions);
  logger.info(`[GameVersionManager] Updated ${slug} to version ${version} for guild ${guildId}`);
}

module.exports = {
  loadVersions,
  saveVersions,
  getVersion,
  setVersion
};
