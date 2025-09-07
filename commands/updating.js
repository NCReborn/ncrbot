const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');

// Shared cooldown map (move to a separate file if you want it shared across all commands)
const statusCooldown = require('./statusCooldown');

const COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updating')
    .setDescription('Set the status channel to "Updating soon (Latest)" (Admin only)'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.editReply({ content: 'This command is restricted to server admins.' });
      return;
    }

    // Cooldown logic
    const channelId = voiceConfig.statusChannelId;
    const now = Date.now();
    const lastUsed = statusCooldown[channelId] || 0;
    if (now - lastUsed < COOLDOWN_TIME) {
      const seconds = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000);
      await interaction.editReply({ content: `Please wait ${seconds} seconds before updating the status channel again.` });
      return;
    }
    statusCooldown[channelId] = now;

    try {
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel) throw new Error('Status channel not found.');
      await channel.setName('🔵┃Status : Updating soon (Latest)');
      await interaction.editReply({ content: `Status channel updated to: Updating soon (Latest)` });
    } catch (err) {
      await interaction.editReply({ content: `Failed to update channel: ${err.message}` });
    }
  }
};
