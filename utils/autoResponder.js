const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../data/autoResponses.json');
const logger = require('./logger');

function readStore() {
  if (!fs.existsSync(filePath)) return { guilds: {}, legacyGlobal: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeStore(parsed);
  } catch (err) {
    logger.error(`[AUTORESPONDER] Failed to parse auto response store: ${err.message}`);
    return { guilds: {}, legacyGlobal: [] };
  }
}

function normalizeStore(parsed) {
  if (Array.isArray(parsed)) {
    return { guilds: {}, legacyGlobal: parsed };
  }

  if (parsed && typeof parsed === 'object') {
    const guilds = parsed.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {};
    const legacyGlobal = Array.isArray(parsed.legacyGlobal)
      ? parsed.legacyGlobal
      : Array.isArray(parsed.responses)
        ? parsed.responses
        : [];

    return { guilds, legacyGlobal };
  }

  return { guilds: {}, legacyGlobal: [] };
}

function writeStore(store) {
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

function getLegacyMigrationGuildId(fallbackGuildId) {
  const configuredLegacyGuildId = (process.env.GUILD_ID || '').trim();
  return configuredLegacyGuildId || fallbackGuildId;
}

function ensureGuildResponses(store, guildId, { migrateLegacy = false } = {}) {
  if (Array.isArray(store.guilds[guildId])) return store.guilds[guildId];

  if (migrateLegacy && store.legacyGlobal.length > 0) {
    const migratedCount = store.legacyGlobal.length;
    const migrationGuildId = getLegacyMigrationGuildId(guildId);
    if (migrationGuildId !== guildId) {
      logger.info(`[AUTORESPONDER] Deferring legacy auto-response migration to configured legacy guild ${migrationGuildId}.`);
      store.guilds[guildId] = [];
      return store.guilds[guildId];
    }

    store.guilds[guildId] = [...store.legacyGlobal];
    store.legacyGlobal = [];
    writeStore(store);
    logger.info(`[AUTORESPONDER] Migrated ${migratedCount} legacy auto-response(s) into guild ${guildId}.`);
    return store.guilds[guildId];
  }

  store.guilds[guildId] = [];
  return store.guilds[guildId];
}

// Load responses
function loadResponses(guildId) {
  const store = readStore();
  if (!guildId) {
    return store.legacyGlobal;
  }
  return ensureGuildResponses(store, guildId, { migrateLegacy: true });
}

// Find by trigger (case insensitive)
function findResponse(guildId, trigger) {
  const responses = loadResponses(guildId);
  return responses.find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
}

// Add or update response
// allowedChannelIds: string[] — empty/null means global (all channels)
function upsertResponse(guildId, trigger, response, wildcard, allowedChannelIds = []) {
  if (!guildId) return;
  const store = readStore();
  const responses = ensureGuildResponses(store, guildId, { migrateLegacy: true });
  const index = responses.findIndex(r => r.trigger.toLowerCase() === trigger.toLowerCase());
  const record = { trigger, response, wildcard, allowedChannelIds: allowedChannelIds ?? [] };
  if (index !== -1) {
    responses[index] = record;
  } else {
    responses.push(record);
  }
  store.guilds[guildId] = responses;
  writeStore(store);
}

// Delete response
function deleteResponse(guildId, trigger) {
  if (!guildId) return;
  const store = readStore();
  const responses = ensureGuildResponses(store, guildId, { migrateLegacy: true });
  store.guilds[guildId] = responses.filter(r => r.trigger.toLowerCase() !== trigger.toLowerCase());
  writeStore(store);
}

module.exports = {
  loadResponses,
  findResponse,
  upsertResponse,
  deleteResponse,
};
