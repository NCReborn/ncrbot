const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { syncSlashCommands } = require('../utils/commandSync');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('synccommands')
    .setDescription('Force sync all slash commands to Discord (admin only)'),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'You must be an admin to use this.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      await syncSlashCommands();
      await interaction.editReply('Slash commands have been synced to Discord.');
    } catch (err) {
      logger.error('Sync command failed:', err);
      await interaction.editReply('Failed to sync slash commands: ' + err.message);
    }
  }
};
