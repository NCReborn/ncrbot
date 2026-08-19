// services/spam/rules/singleImageScam.js

/**
 * Single Image Scam Rule
 * ----------------------
 * Detects scammers who post a single image with no text.
 * Works for new accounts, dormant accounts, and compromised accounts.
 * 
 * Safeguards for legitimate users:
 * - Requires images without ANY accompanying text (images with captions are safe)
 * - Longer grace period for very new users (< 24 hours)
 * - Higher trigger threshold (score >= 6) to reduce false positives
 */

module.exports = async function singleImageScamRule(message, userActivity) {
  const evidence = [];
  let score = 0;

  const now = Date.now();
  // STRICT: Only flag image-only messages with NO text whatsoever
  const isImageOnly = message.attachments.size > 0 && !message.content;

  if (!isImageOnly) {
    return { triggered: false };
  }

  const totalMessages = userActivity.totalMessages || 0;
  const totalMedia = userActivity.totalMedia || 0;
  const joinAgeDays = (now - message.member.joinedTimestamp) / 86400000;

  // --- Core Image-Only Trigger ---
  score += 2;
  evidence.push("Message contains only an image (no text context)");

  // --- New Joiner Indicators (MORE LENIENT) ---
  // SAFEGUARD: Reduced from 7 days to 24 hours grace period
  if (joinAgeDays < 1) {
    score += 2;
    evidence.push("User joined the server very recently (< 24 hours)");
  }

  // SAFEGUARD: Lower weight for message history on new users
  if (totalMessages < 5) {
    score += 1; // Reduced from 2 to 1
    evidence.push(`User has low message history (${totalMessages} messages)`);
  }

  if (totalMedia < 3) {
    score += 1; // Reduced from 2 to 1
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

  // SAFEGUARD: Increased trigger threshold from 4 to 6
  // Requires more evidence before flagging as scam
  const triggered = score >= 6;

  return {
    triggered,
    ruleName: "Single Image Scam",
    score,
    evidence
  };
};
