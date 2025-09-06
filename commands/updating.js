const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updating')
    .setDescription('Set the status channel to "Updating soon (Latest)" (Admin only)'),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'This command is restricted to server admins.', ephemeral: true });
      return;
    }
    try {
      const channel = await interaction.guild.channels.fetch(voiceConfig.statusChannelId);
      if (!channel) throw new Error('Status channel not found.');
      await channel.setName('🔵┃Status : Updating soon (Latest)');
      await interaction.reply({ content: `Status channel updated to: Updating soon (Latest)`, ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: `Failed to update channel: ${err.message}`, ephemeral: true });
    }
  }
};
