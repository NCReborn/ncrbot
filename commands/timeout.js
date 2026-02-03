const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user for a specified duration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to timeout')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('duration')
        .setDescription('Duration of the timeout')
        .setRequired(true)
        .addChoices(
          { name: '1 minute', value: '1m' },
          { name: '5 minutes', value: '5m' },
          { name: '10 minutes', value: '10m' },
          { name: '30 minutes', value: '30m' },
          { name: '1 hour', value: '1h' },
          { name: '6 hours', value: '6h' },
          { name: '12 hours', value: '12h' },
          { name: '1 day', value: '1d' },
          { name: '1 week', value: '1w' }
        )
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const durationChoice = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const moderator = interaction.user;

    try {
      const member = await interaction.guild.members.fetch(targetUser.id);

      if (!member) {
        await interaction.reply({
          content: '❌ User is not in the server.',
          ephemeral: true
        });
        return;
      }

      // Check if target is moderator/admin
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: '❌ You cannot timeout administrators.',
          ephemeral: true
        });
        return;
      }

      // Convert duration string to milliseconds
      const durationMs = this.parseDuration(durationChoice);
      const timeoutUntil = new Date(Date.now() + durationMs);

      // Apply timeout
      await member.timeout(durationMs, reason);

      // Create response embed
      const embed = new EmbedBuilder()
        .setTitle('⏱️ User Timed Out')
        .setColor(0xFF6B6B)
        .setTimestamp()
        .addFields([
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: 'Moderator', value: moderator.tag, inline: true },
          { name: 'Duration', value: this.formatDuration(durationChoice), inline: true },
          { name: 'Expires', value: `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:F> (<t:${Math.floor(timeoutUntil.getTime() / 1000)}:R>)`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        ])
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }));

      await interaction.reply({ embeds: [embed] });

      logger.info(`[MODERATION] ${moderator.tag} timed out ${targetUser.tag} for ${durationChoice}: ${reason}`);

    } catch (error) {
      logger.error('[TIMEOUT] Error executing timeout command:', error);
      await interaction.reply({
        content: '❌ An error occurred while timing out the user. Make sure the bot has the "Timeout Members" permission.',
        ephemeral: true
      });
    }
  },

  parseDuration(duration) {
    const map = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '10m': 10 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000
    };
    return map[duration] || 60 * 1000;
  },

  formatDuration(duration) {
    const map = {
      '1m': '1 minute',
      '5m': '5 minutes',
      '10m': '10 minutes',
      '30m': '30 minutes',
      '1h': '1 hour',
      '6h': '6 hours',
      '12h': '12 hours',
      '1d': '1 day',
      '1w': '1 week'
    };
    return map[duration] || duration;
  }
};
