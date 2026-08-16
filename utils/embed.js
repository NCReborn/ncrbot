const { EmbedBuilder } = require('discord.js');

/**
 * Build the main spam alert embed
 */
function buildSpamAlertEmbed({ title, color, avatar, fields, previewImage }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setThumbnail(avatar)
    .addFields(fields)
    .setTimestamp();

  if (previewImage) {
    embed.setImage(previewImage);
  }

  return embed;
}

/**
 * Build the final action embed (after timeout/ban/false positive)
 */
function buildFinalActionEmbed({ originalEmbed, actionDescription, moderatorTag, moderatorId }) {
  const embed = EmbedBuilder.from(originalEmbed)
    .setTitle('🔒 Alert Resolved')
    .setColor(0x2ECC71)
    .addFields({
      name: 'Action Taken',
      value: `${actionDescription}\nBy: **${moderatorTag}** (${moderatorId})`
    })
    .setTimestamp();

  return embed;
}

module.exports = {
  buildSpamAlertEmbed,
  buildFinalActionEmbed
};
