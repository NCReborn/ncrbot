// services/spam/rules/suspiciousPatterns.js

module.exports = function suspiciousPatternsRule(message, activity, config, activityStats) {
  if (!config.enabled) return { triggered: false };

  // Skip pattern check for established users
  if (config.minMessagesExempt && activityStats?.messages >= config.minMessagesExempt) {
    return { triggered: false };
  }

  const content = config.caseSensitive ? message.content : message.content.toLowerCase();

  for (const pattern of config.patterns) {
    const searchPattern = config.caseSensitive ? pattern : pattern.toLowerCase();

    if (content.includes(searchPattern)) {
      return {
        triggered: true,
        ruleName: "Suspicious Pattern",
        score: 3,
        evidence: [{
          messageId: message.id,
          channelId: message.channelId,
          content: message.content.substring(0, 100),
          attachments: Array.from(message.attachments.values()).map(a => ({ url: a.url, name: a.name }))
        }],
        description: `"${pattern}" detected`,
        keywordOnly: true
      };
    }
  }

  return { triggered: false };
};
