// services/spam/rules/singleImageScam.js

/**
 * Single Image Scam Rule
 * ----------------------
 * Detects scammers who post a single image with no text.
 * Works for new accounts, dormant accounts, and compromised accounts.
 */

module.exports = async function singleImageScamRule(message, userActivity) {
  const evidence = [];
  let score = 0;

  const now = Date.now();
  const isImageOnly = message.attachments.size > 0 && !message.content;

  if (!isImageOnly) {
    return { triggered: false };
  }

  const totalMessages = userActivity.totalMessages || 0;
  const totalMedia = userActivity.totalMedia || 0;
  const joinAgeDays = (now - message.member.joinedTimestamp) / 86400000;

  // --- Core Image-Only Trigger ---
  score += 2;
  evidence.push("Message contains only an image");

  // --- New Joiner Indicators ---
  if (joinAgeDays < 7) {
    score += 2;
    evidence.push("User joined the server recently (< 7 days)");
  }

  if (totalMessages < 5) {
    score += 2;
    evidence.push(`User has very low message history (${totalMessages} messages)`);
  }

  if (totalMedia < 3) {
    score += 2;
    evidence.push("User rarely posts media");
  }

  // --- High-Risk Channel Detection ---
  const highRiskChannels = [
    "lobby",
    "general",
    "help",
    "install",
    "cp2077-lore-spoilers",
    "game-stream"
  ];

  const channelName = message.channel.name.toLowerCase();
  if (highRiskChannels.some(risk => channelName.includes(risk))) {
    score += 2;
    evidence.push(`Image posted in high-risk channel (${message.channel.name})`);
  }

  // --- Bot-Like Behavior ---
  if (userActivity.lastPresenceChange && now - userActivity.lastPresenceChange < 5000) {
    score += 2;
    evidence.push("User posted instantly after coming online (bot-like behavior)");
  }

  // --- OCR Placeholder (future integration) ---
  // if (message.ocrText && containsScamKeywords(message.ocrText)) {
  //   score += 3;
  //   evidence.push("OCR detected scam keywords in the image");
  // }

  // --- Image Hash Placeholder (future integration) ---
  // if (message.imageHashMatch) {
  //   score += 4;
  //   evidence.push("Image hash matches known scam image");
  // }

  const triggered = score >= 4;

  return {
    triggered,
    ruleName: "Single Image Scam",
    score,
    evidence
  };
};
