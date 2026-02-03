/**
 * Centralized constants for NCRBot
 * DO NOT hardcode values in individual files - add them here
 */

const VERSION_INFO = {
  version: "1.0.5",
  changes: "Added Crash-Log Scanning and other backend auto-revision scans"
};

const VERSION_COOLDOWN_TIME = 60 * 60 * 1000; // 60 minutes in milliseconds

const COLLECTION_MAPPINGS = {
  slugs: {
    'ncr': 'rcuccp',
    'adr': 'srpv39',
    'ncr lite': 'vfy7w1',
    'adr lite': 'ezxduq',
    'ncrlite': 'vfy7w1',
    'adrlite': 'ezxduq',
    'e33': 'jzmqt4',
    'expedition33': 'jzmqt4'
  },
  names: {
    'rcuccp': 'NCR',
    'srpv39': 'ADR',
    'vfy7w1': 'NCR Lite',
    'ezxduq': 'ADR Lite',
    'jzmqt4': 'Expedition 33'
  }
};

// ===== ROLE IDS =====
const ROLES = {
  MODERATOR: ['1370874936456908931', '1288633895910375464'],
  PING_BANNED: '1456763426159329555',
  SUPPORT: '1456751771841204295',
};

// ===== CHANNEL IDS =====
const CHANNELS = {
  CRASH_LOG: process.env.CRASH_LOG_CHANNEL_ID || '1287876503811653785',
  LOG_SCAN: process.env.LOG_SCAN_CHANNEL_ID,
  STATUS: '1395501617523986644',
};

// ===== COOLDOWNS (in milliseconds) =====
const COOLDOWNS = {
  USER_COMMAND: 30 * 1000,
  GLOBAL_COMMAND: 30 * 1000,
  LOG_SCAN: 15 * 1000,
  STATUS_UPDATE: 5 * 60 * 1000,
};

// ===== DISCORD LIMITS =====
const LIMITS = {
  MESSAGE_LENGTH: 2000,
  EMBED_DESCRIPTION: 4096,
  EMBED_FIELD_VALUE: 1024,
  EMBED_TITLE: 256,
};

// ===== TIME CONSTANTS =====
const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
};

module.exports = {
  VERSION_INFO,
  VERSION_COOLDOWN_TIME,
  COLLECTION_MAPPINGS,
  ROLES,
  CHANNELS,
  COOLDOWNS,
  LIMITS,
  TIME,
};
