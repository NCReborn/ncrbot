const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  loadStatus,
  saveStatus,
  loadMessageInfo,
  saveMessageInfo,
  clearMessageInfo
} = require('../utils/botControlStatus');

let botStatus = loadStatus();

function getStatusText() {
  return `**Status:**\nMuted: \`${botStatus.muted ? 'Yes' : 'No'}\`\nRunning: \`${botStatus.running ? 'Yes' : 'No'}\``;
}

async function postOrUpdateControlPanel(channel, client) {
  // Remove old message if it exists
  const old = loadMessageInfo();
  if (old && old.channelId && old.messageId) {
    try {
      const ch = await client.channels.fetch(old.channelId);
      if (ch) {
        const msg = await ch.messages.fetch(old.messageId);
        if (msg) await msg.delete();
      }
    } catch (e) {/* ignore */}
    clearMessageInfo();
  }

  // Post new panel
  const embed = new EmbedBuilder()
    .setTitle('🤖 Bot Control Panel')
    .setDescription([
      `**Reload** – Reloads bot commands. (_Anyone in this channel can use._)`,
      `**Mute** – Prevents the bot from responding. (_Anyone in this channel can use._)`,
      `**Unmute** – Unmutes the bot. (_Anyone in this channel can use._)`,
      `**Restart** – Restarts the bot process (for code/repo changes). (_Admin only._)`,
    ].join('\n'))
    .addFields({ name: 'Bot Status', value: getStatusText() })
    .setFooter({ text: 'Use buttons below to control the bot.' })
    .setColor(0x0099ff);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('reload').setLabel('Reload').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('mute').setLabel('Mute').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('unmute').setLabel('Unmute').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('restart').setLabel('Restart').setStyle(ButtonStyle.Danger),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  saveMessageInfo({ channelId: channel.id, messageId: msg.id });
  return msg;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botcontrol')
    .setDescription('Post the bot control panel in this channel (admin only)'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }
    await postOrUpdateControlPanel(interaction.channel, interaction.client);
    await interaction.reply({ content: 'Bot control panel posted!', ephemeral: true });
  },

  botStatus,
  getStatusText,
  postOrUpdateControlPanel,
  saveStatus,
  loadStatus,
};
