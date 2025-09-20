const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveStatusPanelInfo, loadStatusPanelInfo, clearStatusPanelInfo } = require('../utils/statusPanelMessage');

const statusEmbed = new EmbedBuilder()
  .setColor(0x2b2d31)
  .setTitle('Status Control Panel')
  .setDescription(
`-------------------- THESE COMMANDS ARE RATE LIMITED 2 CHANGES PER 10 MINS --------------------
/investigating - Change the status channel to "🟡 | Status: Issues Reported (Latest)"
/issues        - Change the status channel to "🔴 | Status: Issues Detected (Latest)"
/updating      - Change the status channel to "🔵 | Status: Updating soon (Latest)"
/stable        - Change the status channel to "🟢 | Status: Stable (Latest)"
/pending       - Change the status channel to "🔴 | Status: Pending (Core Mods)"
-------------------- THESE COMMANDS ARE RATE LIMITED 2 CHANGES PER 10 MINS --------------------`
  );

const statusButtons = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('status_investigating')
    .setLabel('Investigating')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🟡'),
  new ButtonBuilder()
    .setCustomId('status_issues')
    .setLabel('Issues')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔴'),
  new ButtonBuilder()
    .setCustomId('status_updating')
    .setLabel('Updating')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🔵'),
  new ButtonBuilder()
    .setCustomId('status_stable')
    .setLabel('Stable')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🟢'),
  new ButtonBuilder()
    .setCustomId('status_pending')
    .setLabel('Pending')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔴')
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
