// services/spam/rules/rapidPosting.js

const { RULE_DEFAULTS } = require('../spamConfigResolver');

module.exports = function rapidPostingRule(message, activity, config = {}) {
  if (!config || config.enabled !== true || !activity?.messages) return { triggered: false };

  const ruleConfig = { ...RULE_DEFAULTS.rapidPosting, ...config };
  if (ruleConfig.excludeChannels.includes(message.channelId)) return { triggered: false };

  const now = Date.now();
  const timeWindow = Number(ruleConfig.timeWindowSeconds ?? RULE_DEFAULTS.rapidPosting.timeWindowSeconds) * 1000;
  const messageCount = Number(ruleConfig.messageCount ?? RULE_DEFAULTS.rapidPosting.messageCount);

  const recentMessages = activity.messages.filter(msg => now - msg.timestamp < timeWindow);

  if (recentMessages.length >= messageCount) {
    const timeSpan = ((now - recentMessages[0].timestamp) / 1000).toFixed(0);

    return {
      triggered: true,
      ruleName: "Rapid Posting",
      score: 2,
      evidence: [],
      description: `Posted ${recentMessages.length} messages in ${timeSpan} seconds`
    };
  }

  return { triggered: false };
};
