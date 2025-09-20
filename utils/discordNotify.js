const fetch = require("node-fetch");

/**
 * Send a message to a Discord channel via webhook.
 * @param {string} webhookUrl - The Discord webhook URL.
 * @param {string} content - The message to send.
 * @returns {Promise<void>}
 */
async function sendDiscordNotification(content, webhookUrl = process.env.DISCORD_WEBHOOK_URL) {
  if (!webhookUrl) throw new Error("No webhook URL set!");
  const body = { content };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Failed to send Discord notification: ${res.statusText}`);
  }
}

module.exports = { sendDiscordNotification };
