const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(option =>
      option
        .setName('seconds')
        .setDescription('Slowmode delay in seconds (0 to disable, max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    const moderator = interaction.user;
    const channel = interaction.channel;

    try {
      // Set slowmode
      await channel.setRateLimitPerUser(seconds, `Slowmode set by ${moderator.tag}`);

      // Create response embed
      const embed = new EmbedBuilder()
        .setTimestamp()
        .addFields([
          { name: 'Channel', value: `${channel.toString()} (#${channel.name})`, inline: true },
          { name: 'Set By', value: moderator.tag, inline: true }
        ]);

      if (seconds === 0) {
        embed.setTitle('🔓 Slowmode Disabled')
          .setColor(0x00FF00)
          .addFields([
            { name: 'Status', value: 'Slowmode has been disabled for this channel.', inline: false }
          ]);
      } else {
        embed.setTitle('🐌 Slowmode Enabled')
          .setColor(0xFFA500)
          .addFields([
            { name: 'Delay', value: `${seconds} second${seconds !== 1 ? 's' : ''}`, inline: true },
            { name: 'Status', value: `Users can send a message every ${seconds} second${seconds !== 1 ? 's' : ''}.`, inline: false }
          ]);
      }

      await interaction.reply({ embeds: [embed] });

      logger.info(`[MODERATION] ${moderator.tag} set slowmode to ${seconds}s in #${channel.name}`);

    } catch (error) {
      logger.error('[SLOWMODE] Error executing slowmode command:', error);
      await interaction.reply({
        content: '❌ An error occurred while setting slowmode. Make sure the bot has the "Manage Channels" permission.',
        ephemeral: true
      });
    }
  }
};
