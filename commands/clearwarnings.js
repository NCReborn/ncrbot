const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const moderationService = require('../services/ModerationService');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear all warnings for a user (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to clear warnings for')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const moderator = interaction.user;

    try {
      const count = moderationService.clearUserWarnings(user.id);

      if (count === 0) {
        await interaction.reply({
          content: `ℹ️ ${user.tag} had no warnings to clear.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Warnings Cleared')
        .setColor(0x00FF00)
        .setTimestamp()
        .addFields([
          { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Cleared By', value: moderator.tag, inline: true },
          { name: 'Warnings Cleared', value: `${count}`, inline: true }
        ])
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }));

      await interaction.reply({ embeds: [embed] });

      logger.info(`[MODERATION] ${moderator.tag} cleared ${count} warnings for ${user.tag}`);

    } catch (error) {
      logger.error('[CLEARWARNINGS] Error executing clearwarnings command:', error);
      await interaction.reply({
        content: '❌ An error occurred while clearing warnings.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
