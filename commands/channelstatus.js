const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');

const statusNames = {
  updating: '🔵┃Status : Updating soon (Latest)',
  investigating: '🟡┃Status : Issues Reported (Latest)',
  issues: '🔴┃Status : Issues Detected (Latest)',
  stable: '🟢┃Status : Stable (Latest)',
};

module.exports = {
  data: [
    new SlashCommandBuilder()
      .setName('updating')
      .setDescription('Set the status channel to "Updating soon (Latest)" (Admin only)'),
    new SlashCommandBuilder()
      .setName('investigating')
      .setDescription('Set the status channel to "Issues Reported (Latest)" (Admin only)'),
    new SlashCommandBuilder()
      .setName('issues')
      .setDescription('Set the status channel to "Issues Detected (Latest)" (Admin only)'),
    new SlashCommandBuilder()
      .setName('stable')
      .setDescription('Set the status channel to "Stable (Latest)" (Admin only)'),
  ],
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'This command is restricted to server admins.', ephemeral: true });
      return;
    }

    const command = interaction.commandName;
    const status = statusNames[command];

    if (!status) {
      await interaction.reply({ content: 'Unknown status command.', ephemeral: true });
      return;
    }

    try {
      const channel = await interaction.guild.channels.fetch(voiceConfig.statusChannelId);
      if (!channel) throw new Error('Status channel not found.');
      await channel.setName(status);
      await interaction.reply({ content: `Status channel updated to: ${status}`, ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: `Failed to update channel: ${err.message}`, ephemeral: true });
    }
  },
};
