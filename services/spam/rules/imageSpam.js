// services/spam/rules/imageSpam.js

module.exports = function imageSpamRule(message, activity, config = {}) {
  if (!config?.enabled) return { triggered: false };
  if ((config.excludeChannels || []).includes(message.channelId)) return { triggered: false };

  const now = Date.now();
  const timeWindow = (config.timeWindowSeconds || 10) * 1000;

  const recentImages = activity.images.filter(img => now - img.timestamp < timeWindow);

  if (recentImages.length >= config.imageCount) {
    const timeSpan = ((now - recentImages[0].timestamp) / 1000).toFixed(0);

    return {
      triggered: true,
      ruleName: "Image Spam",
      score: 2,
      evidence: [],
      description: `Posted ${recentImages.length} images in ${timeSpan} seconds`
    };
  }

  return { triggered: false };
};
