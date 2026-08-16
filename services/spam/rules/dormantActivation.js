// services/spam/rules/dormantActivation.js

/**
 * Dormant / Compromised Account Activation Rule
 * ---------------------------------------------
 * Detects when a long-silent or compromised account suddenly posts media.
 */

module.exports = async function dormantActivationRule(message, userActivity) {
  const evidence = [];
  let score = 0;

  const now = Date.now();
  const lastMessage = userActivity.lastMessageTimestamp || 0;
  const timeSinceLastMessage = now - lastMessage;

  const totalMessages = userActivity.totalMessages || 0;
  const totalMedia = userActivity.totalMedia || 0;

  const accountAgeDays = (now - message.author.createdTimestamp) / 86400000;
  const joinAgeDays = (now - message.member.joinedTimestamp) / 86400000;

  const isImageOnly = message.attachments.size > 0 && !message.content;

  // --- Dormancy Indicators ---
  if (timeSinceLastMessage > 60 * 24 * 60 * 60 * 1000) { // 60 days
    score += 3;
    evidence.push("User has not sent a message in over 60 days");
  }

  if (totalMessages < 5) {
    score += 2;
    evidence.push(`User has very low message history (${totalMessages} messages)`);
  }

  if (totalMedia < 3 && isImageOnly) {
    score += 2;
    evidence.push("User rarely posts media but posted an image-only message");
  }

  // --- Compromise Indicators ---
  if (userActivity.lastAvatarChange && now - userActivity.lastAvatarChange < 30000) {
    score += 2;
    evidence.push("Avatar changed recently (possible compromise)");
  }

  if (userActivity.lastUsernameChange && now - userActivity.lastUsernameChange < 30000) {
    score += 2;
    evidence.push("Username changed recently (possible compromise)");
  }

  if (userActivity.lastPresenceChange && now - userActivity.lastPresenceChange < 5000) {
    score += 3;
    evidence.push("User came online seconds before posting (bot-like behavior)");
  }

  if (userActivity.lastDeviceChange && now - userActivity.lastDeviceChange < 5000) {
    score += 2;
    evidence.push("Device changed moments before posting (possible compromise)");
  }

  // --- Behavior Indicators ---
  if (isImageOnly) {
    score += 2;
    evidence.push("Message contains only an image");
  }

  // --- Trigger Threshold ---
  const triggered = score >= 4;

  return {
    triggered,
    ruleName: "Dormant Account Activation",
    score,
    evidence
  };
};
