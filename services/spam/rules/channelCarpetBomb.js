// services/spam/rules/channelCarpetBomb.js

module.exports = function channelCarpetBombRule(message, activity, config = {}) {
  if (!config?.enabled) return { triggered: false };

  const now = Date.now();
  const timeWindow = (config.timeWindowSeconds || 10) * 1000;
  const watchedSet = new Set(config.watchedChannels || []);

  const recentWatchedMessages = activity.messages.filter(msg =>
    now - msg.timestamp < timeWindow && watchedSet.has(msg.channelId)
  );

  const uniqueWatchedChannels = new Set(recentWatchedMessages.map(msg => msg.channelId));

  if (uniqueWatchedChannels.size >= config.minChannelHits) {
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
