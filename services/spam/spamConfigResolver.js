const RULE_DEFAULTS = {
  multiChannelSpam: {
    enabled: false,
    channelCount: 5,
    timeWindowSeconds: 30,
    timeoutSeconds: 43200
  },
  rapidPosting: {
    enabled: false,
    messageCount: 8,
    timeWindowSeconds: 15,
    timeoutSeconds: 43200,
    excludeChannels: []
  },
  imageSpam: {
    enabled: false,
    imageCount: 6,
    timeWindowSeconds: 60,
    timeoutSeconds: 43200,
    excludeChannels: []
  },
  suspiciousPatterns: {
    enabled: false,
    patterns: [],
    timeoutSeconds: 43200,
    caseSensitive: false,
    minMessagesExempt: 50,
    requiresOtherTrigger: false
  },
  newAccountMonitoring: {
    enabled: false,
    accountAgeDays: 30,
    requiresOtherTrigger: true,
    timeoutSeconds: 43200
  },
  dormantUserSpam: {
    enabled: false,
    minServerAgeDays: 1,
    maxHistoricalMessages: 2,
    maxHistoricalMedia: 0,
    minCurrentImages: 3,
    timeoutSeconds: 43200,
    severity: 'high'
  },
  channelCarpetBomb: {
    enabled: false,
    watchedChannels: [],
    minChannelHits: 3,
    timeWindowSeconds: 20,
    timeoutSeconds: 43200,
    severity: 'critical'
  },
  singleImageScam: {
    enabled: false,
    minMessages: 5,
    minMedia: 3,
    highRiskChannels: [],
    timeoutSeconds: 43200,
    severity: 'high'
  },
  dormantActivation: {
    enabled: false,
    minDormantDays: 60,
    minMessages: 5,
    minMedia: 3,
    timeoutSeconds: 43200,
    severity: 'high'
  }
};

const DEFAULT_SPAM_CONFIG = {
  enabled: false,
  defaultTimeoutSeconds: 3600,
  confidenceThreshold: 3,
  alertChannelId: null,
  protectedChannels: {},
  rules: RULE_DEFAULTS,
  whitelist: {
    users: [],
    roles: []
  },
  debug: {
    enabled: false,
    testUserId: null
  }
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    );
  }

  return value;
}

function deepMerge(baseValue, overrideValue) {
  if (Array.isArray(overrideValue)) {
    return cloneValue(overrideValue);
  }

  if (Array.isArray(baseValue)) {
    return overrideValue === undefined ? cloneValue(baseValue) : cloneValue(overrideValue);
  }

  if (isPlainObject(baseValue) || isPlainObject(overrideValue)) {
    const baseObject = isPlainObject(baseValue) ? baseValue : {};
    const overrideObject = isPlainObject(overrideValue) ? overrideValue : {};
    const merged = {};

    for (const key of new Set([...Object.keys(baseObject), ...Object.keys(overrideObject)])) {
      merged[key] = deepMerge(baseObject[key], overrideObject[key]);
    }

    return merged;
  }

  return overrideValue === undefined ? cloneValue(baseValue) : cloneValue(overrideValue);
}

function normalizeArrayFields(effectiveConfig) {
  const rules = effectiveConfig.rules || {};

  for (const [ruleName, defaultRule] of Object.entries(RULE_DEFAULTS)) {
    const effectiveRule = rules[ruleName];
    if (!isPlainObject(effectiveRule)) continue;

    for (const [fieldName, defaultValue] of Object.entries(defaultRule)) {
      if (Array.isArray(defaultValue) && !Array.isArray(effectiveRule[fieldName])) {
        effectiveRule[fieldName] = [];
      }
    }
  }

  if (!Array.isArray(effectiveConfig.whitelist?.users)) {
    effectiveConfig.whitelist.users = [];
  }

  if (!Array.isArray(effectiveConfig.whitelist?.roles)) {
    effectiveConfig.whitelist.roles = [];
  }

  return effectiveConfig;
}

function getEffectiveSpamConfig(config, guildId) {
  const sourceConfig = isPlainObject(config) ? config : {};
  const { guilds = {}, ...globalConfig } = sourceConfig;
  const guildOverride = guildId ? guilds?.[guildId] : undefined;

  return normalizeArrayFields(
    deepMerge(
      DEFAULT_SPAM_CONFIG,
      deepMerge(globalConfig, guildOverride)
    )
  );
}

module.exports = {
  RULE_DEFAULTS,
  DEFAULT_SPAM_CONFIG,
  getEffectiveSpamConfig
};
