const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stable')
    .setDescription('Set the status channel to "Stable (Latest)" (Admin only)'),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'This command is restricted to server admins.', ephemeral: true });
      return;
    }
    try {
      const channel = await interaction.guild.channels.fetch(voiceConfig.statusChannelId);
      if (!channel) throw new Error('Status channel not found.');
      await channel.setName('🟢┃Status : Stable (Latest)');
      await interaction.reply({ content: `Status channel updated to: Stable (Latest)`, ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: `Failed to update channel: ${err.message}`, ephemeral: true });
    }
  }
};
