// services/spam/rules/rapidPosting.js

module.exports = function rapidPostingRule(message, activity, config) {
  if (!config.enabled) return { triggered: false };
  if (config.excludeChannels.includes(message.channelId)) return { triggered: false };

  const now = Date.now();
  const timeWindow = config.timeWindowSeconds * 1000;

  const recentMessages = activity.messages.filter(msg => now - msg.timestamp < timeWindow);

  if (recentMessages.length >= config.messageCount) {
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
