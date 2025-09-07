const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const logger = require('../utils/logger');
const { syncSlashCommands } = require('../utils/commandSync');
const { errorEmbed } = require('../utils/discordUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Reload all slash commands (Admin only)'),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ embeds: [errorEmbed('Permission Denied', 'This command is restricted to server admins.')], ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      await syncSlashCommands();
      await interaction.editReply({ content: 'Slash commands reloaded successfully.' });
      logger.info(`[RELOAD] Slash commands reloaded by ${interaction.user.tag}`);
    } catch (err) {
      logger.error(`[RELOAD] Failed to reload commands: ${err.message}`);
      await interaction.editReply({ embeds: [errorEmbed('Reload Failed', err.message)] });
    }
  }
};
