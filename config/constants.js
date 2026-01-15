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
  },
  names: {
    'rcuccp': 'NCR',
    'srpv39': 'ADR',
    'vfy7w1': 'NCR Lite',
    'ezxduq': 'ADR Lite',
  }
};

module.exports = {
  VERSION_INFO,
  VERSION_COOLDOWN_TIME,
  COLLECTION_MAPPINGS
};
