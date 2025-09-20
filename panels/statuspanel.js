const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveStatusPanelInfo, loadStatusPanelInfo, clearStatusPanelInfo } = require('../utils/statusPanelMessage');

const statusEmbed = new EmbedBuilder()
  .setColor(0xf1c40f)
  .setTitle('🔔 Status Control Panel')
  .setDescription(
    "**Note:** Status changes are *rate limited* to **2 per 10 minutes**.\n\n" +
    "🟡 `/investigating` — Set status: **Issues Reported (Latest)**\n" +
    "🔴 `/issues` — Set status: **Issues Detected (Latest)**\n" +
    "🔵 `/updating` — Set status: **Updating soon (Latest)**\n" +
    "🟢 `/stable` — Set status: **Stable (Latest)**\n" +
    "🔴 `/pending` — Set status: **Pending (Core Mods)**"
  );

const statusButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('status_investigating')
    .setLabel('Investigating')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🕵️'), // Detective emoji

  new ButtonBuilder()
    .setCustomId('status_issues')
    .setLabel('Issues')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⚠️'), // Warning emoji

  new ButtonBuilder()
    .setCustomId('status_updating')
    .setLabel('Updating')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔄'), // Update emoji

  new ButtonBuilder()
    .setCustomId('status_stable')
    .setLabel('Stable')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('✅'), // Check mark

  new ButtonBuilder()
    .setCustomId('status_pending')
    .setLabel('Pending')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏳') // Hourglass
);

async function postOrUpdateStatusPanel(channel) {
  const msgInfo = loadStatusPanelInfo();
  let message;
  try {
    if (msgInfo && msgInfo.channelId === channel.id && msgInfo.messageId) {
      // Try to edit the existing panel
      message = await channel.messages.fetch(msgInfo.messageId);
      await message.edit({ embeds: [statusEmbed], components: [statusButtons] });
    } else {
      // Post a new panel
      message = await channel.send({ embeds: [statusEmbed], components: [statusButtons] });
    }
    // Save the new message info
    saveStatusPanelInfo({ channelId: channel.id, messageId: message.id });
  } catch (e) {
    clearStatusPanelInfo();
    // Post a new panel if edit failed
    message = await channel.send({ embeds: [statusEmbed], components: [statusButtons] });
    saveStatusPanelInfo({ channelId: channel.id, messageId: message.id });
  }
}

module.exports = { postOrUpdateStatusPanel };
