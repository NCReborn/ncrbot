const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const moderationService = require('../services/ModerationService');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user for rule violations')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('The reason for the warning')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const moderator = interaction.user;

    // Don't warn bots
    if (user.bot) {
      await interaction.reply({
        content: '❌ You cannot warn bots.',
        ephemeral: true
      });
      return;
    }

    try {
      // Add warning to database
      const result = moderationService.addWarning(
        user.id,
        moderator.id,
        reason,
        interaction.guildId
      );

      // Create response embed
      const embed = new EmbedBuilder()
        .setTitle('⚠️ User Warned')
        .setColor(0xFFA500)
        .setTimestamp()
        .addFields([
          { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Moderator', value: `${moderator.tag}`, inline: true },
          { name: 'Total Warnings', value: `${result.totalWarnings}`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        ])
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }));

      // Send response in channel
      await interaction.reply({ embeds: [embed] });

      // Try to DM the user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('⚠️ Warning Received')
          .setColor(0xFFA500)
          .setTimestamp()
          .setDescription(`You have received a warning in **${interaction.guild.name}**.`)
          .addFields([
            { name: 'Reason', value: reason, inline: false },
            { name: 'Moderator', value: moderator.tag, inline: true },
            { name: 'Total Warnings', value: `${result.totalWarnings}`, inline: true }
          ])
          .setFooter({ text: 'Please review the server rules to avoid future warnings.' });

        await user.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        // User has DMs disabled, that's okay
        logger.warn(`[WARN] Could not DM user ${user.tag}: ${dmError.message}`);
      }

      logger.info(`[MODERATION] ${moderator.tag} warned ${user.tag}: ${reason}`);

    } catch (error) {
      logger.error('[WARN] Error executing warn command:', error);
      await interaction.reply({
        content: '❌ An error occurred while warning the user.',
        ephemeral: true
      });
    }
  }
};
