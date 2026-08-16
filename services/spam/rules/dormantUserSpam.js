// services/spam/rules/dormantUserSpam.js

module.exports = function dormantUserSpamRule(message, activityStats, config) {
  if (!config.enabled) return { triggered: false };

  const serverAge = activityStats.serverAgeDays;
  if (serverAge < config.minServerAgeDays) return { triggered: false };

  const totalMessages = activityStats.messages;
  const totalMedia = activityStats.media;

  // Count images in current message
  let currentImageCount = 0;

  if (message.attachments.size > 0) {
    const imageAttachments = Array.from(message.attachments.values()).filter(a =>
      (a.contentType || "").startsWith("image/")
    );
    currentImageCount += imageAttachments.length;
  }

  if (message.embeds.length > 0) {
    const embedsWithImages = message.embeds.filter(embed => embed.image || embed.thumbnail);
    currentImageCount += embedsWithImages.length;
  }

  const historicalMessages = Math.max(0, totalMessages - 1);
  const historicalMedia = Math.max(0, totalMedia - currentImageCount);

  if (
    historicalMessages <= config.maxHistoricalMessages &&
    historicalMedia <= config.maxHistoricalMedia &&
    currentImageCount >= config.minCurrentImages
  ) {
    return {
      triggered: true,
      ruleName: "Dormant User Spam",
      score: 2,
      evidence: [{
        messageId: message.id,
        channelId: message.channelId,
        content: message.content.substring(0, 100),
        attachments: Array.from(message.attachments.values()).map(a => ({ url: a.url, name: a.name }))
      }],
      description: `Dormant user (${historicalMessages} prev msg, ${historicalMedia} prev media) posting ${currentImageCount} images`
    };
  }

  return { triggered: false };
};
