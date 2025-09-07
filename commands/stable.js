const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');
const statusCooldown = require('../utils/statusCooldown');
const logger = require('../utils/logger');
const COOLDOWN_TIME = 5 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stable')
    .setDescription('Set the status channel to "Stable (Latest)" (Admin only)'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.editReply({ content: 'This command is restricted to server admins.' });
      return;
    }

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
      await channel.setName('🟢┃Status : Stable (Latest)');
      await interaction.editReply({ content: `Status channel updated to: Stable (Latest)` });
    } catch (err) {
      logger.error(`Failed to update channel in /stable: ${err.stack || err}`);
      await interaction.editReply({ content: `Failed to update channel: ${err.message}` });
    }
  }
};
