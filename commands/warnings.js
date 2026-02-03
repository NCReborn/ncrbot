const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const moderationService = require('../services/ModerationService');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View all warnings for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to check warnings for')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');

    try {
      const warnings = moderationService.getUserWarnings(user.id);

      if (warnings.length === 0) {
        await interaction.reply({
          content: `✅ ${user.tag} has no warnings.`,
          ephemeral: true
        });
        return;
      }

      // Create embed with all warnings
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warnings for ${user.tag}`)
        .setColor(0xFFA500)
        .setTimestamp()
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
        .setDescription(`Total Warnings: **${warnings.length}**`);

      // Add each warning as a field (limit to 25 fields max)
      const displayWarnings = warnings.slice(-25);
      
      for (let i = 0; i < displayWarnings.length; i++) {
        const warning = displayWarnings[i];
        const moderator = await interaction.client.users.fetch(warning.moderatorId).catch(() => null);
        const moderatorName = moderator ? moderator.tag : `Unknown (${warning.moderatorId})`;
        const timestamp = Math.floor(warning.timestamp / 1000);

        embed.addFields([{
          name: `Warning #${i + 1} - <t:${timestamp}:R>`,
          value: `**Reason:** ${warning.reason}\n**Moderator:** ${moderatorName}`,
          inline: false
        }]);
      }

      if (warnings.length > 25) {
        embed.setFooter({ text: `Showing last 25 of ${warnings.length} warnings` });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      logger.error('[WARNINGS] Error executing warnings command:', error);
      await interaction.reply({
        content: '❌ An error occurred while fetching warnings.',
        ephemeral: true
      });
    }
  }
};
