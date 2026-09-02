// services/spam/rules/channelCarpetBomb.js

const { RULE_DEFAULTS } = require('../spamConfigResolver');

module.exports = function channelCarpetBombRule(message, activity, config = {}) {
  if (!config || config.enabled !== true || !activity?.messages) return { triggered: false };

  const ruleConfig = { ...RULE_DEFAULTS.channelCarpetBomb, ...config };
  const now = Date.now();
  const timeWindow = Number(ruleConfig.timeWindowSeconds ?? RULE_DEFAULTS.channelCarpetBomb.timeWindowSeconds) * 1000;
  const watchedSet = new Set(ruleConfig.watchedChannels || []);
  const minChannelHits = Number(ruleConfig.minChannelHits ?? RULE_DEFAULTS.channelCarpetBomb.minChannelHits);

  const recentWatchedMessages = activity.messages.filter(msg =>
    now - msg.timestamp < timeWindow && watchedSet.has(msg.channelId)
  );

  const uniqueWatchedChannels = new Set(recentWatchedMessages.map(msg => msg.channelId));

  if (recentWatchedMessages.length > 0 && uniqueWatchedChannels.size >= minChannelHits) {
    const earliestTimestamp = Math.min(...recentWatchedMessages.map(m => m.timestamp));
    const timeSpan = ((now - earliestTimestamp) / 1000).toFixed(0);

    return {
      triggered: true,
      ruleName: "Channel Carpet-Bomb",
      score: 3,
      evidence: recentWatchedMessages.map(msg => ({
        messageId: msg.id,
        channelId: msg.channelId,
        content: msg.content.substring(0, 100),
        attachments: msg.attachments || []
      })),
      description: `Posted in ${uniqueWatchedChannels.size} watched entry-point channels in ${timeSpan} seconds`
    };
  }

  return { triggered: false };
};
