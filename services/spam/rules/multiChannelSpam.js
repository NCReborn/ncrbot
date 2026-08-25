// services/spam/rules/multiChannelSpam.js

module.exports = function multiChannelSpamRule(message, activity, config) {
  if (!config.enabled) return { triggered: false };

  const now = Date.now();
  const timeWindow = config.timeWindowSeconds * 1000;

  const recentMessages = activity.messages.filter(msg => now - msg.timestamp < timeWindow);
  const uniqueChannels = new Set(recentMessages.map(msg => msg.channelId));

  if (uniqueChannels.size >= config.channelCount) {
    const timeSpan = ((now - recentMessages[0].timestamp) / 1000).toFixed(0);

    return {
      triggered: true,
      ruleName: "Multi-Channel Spam",
      score: 2,
      evidence: recentMessages.map(msg => ({
        messageId: msg.id,
        channelId: msg.channelId,
        content: msg.content.substring(0, 100),
        attachments: msg.attachments || []
      })),
      description: `Posted in ${uniqueChannels.size} channels in ${timeSpan} seconds`
    };
  }

  return { triggered: false };
};
