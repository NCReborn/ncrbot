const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '../data/versionInfo.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setversion')
    .setDescription('Update the bot version and changelog (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    // Modal setup
    const modal = new ModalBuilder()
      .setCustomId('setVersionModal')
      .setTitle('Set Version Info');

    const versionInput = new TextInputBuilder()
      .setCustomId('version')
      .setLabel('Version Number')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 1.2.3')
      .setRequired(true);

    const changesInput = new TextInputBuilder()
      .setCustomId('changes')
      .setLabel('Changes')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe what was changed or fixed...')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(versionInput),
      new ActionRowBuilder().addComponents(changesInput)
    );

    await interaction.showModal(modal);
  },
};
