const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ncrbotmsg')
    .setDescription('Post a multi-line message as NCRBot (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    // Check for Administrator permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }
    // Show modal for multi-line input
    const modal = new ModalBuilder()
      .setCustomId('ncrbot_modal')
      .setTitle('Post as NCRBot');
    const msgInput = new TextInputBuilder()
      .setCustomId('ncrbot_message')
      .setLabel('Message Content')
      .setPlaceholder('Paste or write your full message here...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000); // Discord hard limit for messages
    modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
    await interaction.showModal(modal);
  }
};
