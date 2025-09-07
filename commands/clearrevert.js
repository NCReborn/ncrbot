const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { setRevision, getRevision } = require('../utils/revisionStore');
const logger = require('../utils/logger');
const { errorEmbed } = require('../utils/discordUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearrevert')
    .setDescription('Clears the scheduled status revert (Admin only)'),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ embeds: [errorEmbed('Permission Denied', 'This command is restricted to server admins.')], ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const revision = await getRevision();
      await setRevision(revision, null);
      await interaction.editReply({ content: 'Scheduled status revert cleared. If a revert was pending, it will not occur until the next revision event.' });
      logger.info(`[CLEARREVERT] Scheduled status revert cleared by ${interaction.user.tag}`);
    } catch (err) {
      logger.error(`[CLEARREVERT] Failed to clear revert: ${err.message}`);
      await interaction.editReply({ embeds: [errorEmbed('Clear Revert Failed', err.message)] });
    }
  }
};
