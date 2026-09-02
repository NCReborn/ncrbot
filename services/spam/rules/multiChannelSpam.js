// services/spam/rules/multiChannelSpam.js

const { RULE_DEFAULTS } = require('../spamConfigResolver');

module.exports = function multiChannelSpamRule(message, activity, config = {}) {
  if (!config || config.enabled !== true || !activity?.messages) return { triggered: false };

  const ruleConfig = { ...RULE_DEFAULTS.multiChannelSpam, ...config };
  const now = Date.now();
  const timeWindow = Number(ruleConfig.timeWindowSeconds ?? RULE_DEFAULTS.multiChannelSpam.timeWindowSeconds) * 1000;
  const channelCount = Number(ruleConfig.channelCount ?? RULE_DEFAULTS.multiChannelSpam.channelCount);

  const recentMessages = activity.messages.filter(msg => now - msg.timestamp < timeWindow);
  const uniqueChannels = new Set(recentMessages.map(msg => msg.channelId));

  if (recentMessages.length > 0 && uniqueChannels.size >= channelCount) {
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
