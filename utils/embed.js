const { EmbedBuilder } = require('discord.js');

/**
 * Build the main spam alert embed.
 * @param {object} opts
 * @param {string} opts.title
 * @param {number} opts.color
 * @param {string} opts.avatar  - user avatar URL for thumbnail
 * @param {object[]} opts.fields
 */
function buildSpamAlertEmbed({ title, color, avatar, fields }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setThumbnail(avatar)
    .addFields(fields)
    .setTimestamp();

  return embed;
}

/**
 * Build a "pending staff review" embed after an automatic action was applied.
 * All fields are preserved from the original embed; a status note is appended.
 * Buttons remain active — the alert is NOT resolved yet.
 */
function buildPendingReviewEmbed({ originalEmbed }) {
  const embed = EmbedBuilder.from(originalEmbed)
    .setColor(0xFF0000)
    .setFooter({ text: '⏳ Pending Staff Review — use the buttons above to resolve this alert.' });

  return embed;
}

/**
 * Build the final action embed after a staff member explicitly resolves the alert.
 * Buttons will be removed by the caller.
 */
function buildFinalActionEmbed({ originalEmbed, actionDescription, moderatorTag, moderatorId }) {
  const embed = EmbedBuilder.from(originalEmbed)
    .setTitle('🔒 Alert Resolved')
    .setColor(0x2ECC71)
    .setFooter(null)
    .addFields({
      name: '✅ Resolution',
      value: `${actionDescription}\nBy: **${moderatorTag}** (${moderatorId})`
    })
    .setTimestamp();

  return embed;
}

module.exports = {
  buildSpamAlertEmbed,
  buildPendingReviewEmbed,
  buildFinalActionEmbed
};
