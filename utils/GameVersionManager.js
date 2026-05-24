const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const VERSION_FILE = path.join(__dirname, '../data/gameVersions.json');

function loadVersions() {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const data = fs.readFileSync(VERSION_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('[GameVersionManager] Failed to load game versions:', error);
  }
  return {};
}

function saveVersions(versions) {
  try {
    const dir = path.dirname(VERSION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versions, null, 2));
  } catch (error) {
    logger.error('[GameVersionManager] Failed to save game versions:', error);
  }
}

function getVersion(slug) {
  const versions = loadVersions();
  return versions[slug] || '1.0';
}

function setVersion(slug, version) {
  const versions = loadVersions();
  versions[slug] = version;
  saveVersions(versions);
  logger.info(`[GameVersionManager] Updated ${slug} to version ${version}`);
}

module.exports = {
  loadVersions,
  saveVersions,
  getVersion,
  setVersion
};
