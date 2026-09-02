// services/spam/rules/imageSpam.js

const { RULE_DEFAULTS } = require('../spamConfigResolver');

module.exports = function imageSpamRule(message, activity, config = {}) {
  if (!config || config.enabled !== true || !activity?.images) return { triggered: false };

  const ruleConfig = { ...RULE_DEFAULTS.imageSpam, ...config };
  if (ruleConfig.excludeChannels.includes(message.channelId)) return { triggered: false };

  const now = Date.now();
  const timeWindow = Number(ruleConfig.timeWindowSeconds ?? RULE_DEFAULTS.imageSpam.timeWindowSeconds) * 1000;
  const imageCount = Number(ruleConfig.imageCount ?? RULE_DEFAULTS.imageSpam.imageCount);

  const recentImages = activity.images.filter(img => now - img.timestamp < timeWindow);

  if (recentImages.length >= imageCount) {
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
