/**
 * Centralized constants for NCRBot
 * DO NOT hardcode values in individual files - add them here
 */

const VERSION_INFO = {
  version: "1.1.0",
  changes: "Migrated to modular 3-collection system (NCR Core/Extras/Body)"
};

const VERSION_COOLDOWN_TIME = 60 * 60 * 1000; // 60 minutes in milliseconds

const COLLECTION_MAPPINGS = {
  slugs: {
    'ncr core': 'rcuccp',
    'ncrcore': 'rcuccp',
    'core': 'rcuccp',
    'ncr extras': 'srpv39',
    'ncrextras': 'srpv39',
    'extras': 'srpv39',
    'ncr body': 'vfy7w1',
    'ncrbody': 'vfy7w1',
    'body': 'vfy7w1'
  },
  names: {
    'rcuccp': 'NCR Core',
    'srpv39': 'NCR Extras',
    'vfy7w1': 'NCR Body'
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
  BOT_ALERTS: '1468304973669466184', // New: Channel for forum alerts
  SHOWCASE: '1285797205927792782',
  SHOWCASE_NSFW: '1488110174999806003',
  BOT_SPAM: '1406269920211374080',
  ADMIN_CHAT: '1324990321393930240',
  SNAPSMITH_ANNOUNCEMENTS: '1400001005285801985',
};

// ===== FORUM CONFIGURATION =====
const FORUM = {
  BUGS_AND_ISSUES_FORUM_ID: '1468547310509228204', // Add your forum channel ID here
  MEGATHREAD_ID: '1468548146367037472', // Add the megathread thread ID here
  TAGS: {
    INVESTIGATING: 'Investigating',
    COLLECTION_ISSUES: 'Collection Issues',
    MOD_ISSUES: 'Mod Issues',
    INSTALLATION_ISSUES: 'Installation Issues',
  },
  // Map tag names to embed colors and section names
  TAG_CONFIG: {
    'Collection Issues': {
      color: 10181046,
      section: 'Collection Issues',
      embedIndex: 2
    },
    'Mod Issues': {
      color: 15277667,
      section: 'Mod Issues',
      embedIndex: 3
    },
    'Installation Issues': {
      color: 9134176,
      section: 'Installation Issues',
      embedIndex: 4
    }
  }
};

// ===== HELPER ROLES (monitored for dormancy alerts) =====
const HELPER_ROLES = {
  'Ripperdoc': '1288633895910375464',
  // Add more helper roles here as needed
};

// ===== COOLDOWNS (in milliseconds) =====
const COOLDOWNS = {
  USER_COMMAND: 30 * 1000,
  GLOBAL_COMMAND: 5 * 1000,
};

module.exports = {
  VERSION_INFO,
  VERSION_COOLDOWN_TIME,
  COLLECTION_MAPPINGS,
  ROLES,
  CHANNELS,
  FORUM,
  HELPER_ROLES,
  COOLDOWNS
};
