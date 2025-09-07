const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');
const { checkAndSetCooldown } = require('../utils/statusCooldown');
const logger = require('../utils/logger');
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

    const channelId = voiceConfig.statusChannelId;
    const seconds = checkAndSetCooldown(channelId, COOLDOWN_TIME);
    if (seconds > 0) {
      await interaction.editReply({ content: `Please wait ${seconds} seconds before updating the status channel again.` });
      return;
    }

    try {
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel) throw new Error('Status channel not found.');
      await channel.setName('🔵┃Status : Updating soon (Latest)');
      await interaction.editReply({ content: `Status channel updated to: Updating soon (Latest)` });
    } catch (err) {
      logger.error(`Failed to update channel in /updating: ${err.stack || err}`);
      await interaction.editReply({ content: `Failed to update channel: ${err.message}` });
    }
  }
};
