const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');
const { checkAndSetCooldown } = require('../utils/statusCooldown');
const logger = require('../utils/logger');
const { errorEmbed } = require('../utils/discordUtils');
const COOLDOWN_TIME = 5 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stable')
    .setDescription('Set the status channel to "Stable (Latest)" (Admin only)'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = `${interaction.user.tag} (${interaction.user.id})`;
    const channelId = voiceConfig.statusChannelId;

    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        logger.warn(`[STABLE] Permission denied for ${username} in guild ${interaction.guildId}`);
        await interaction.editReply({ embeds: [errorEmbed('Permission Denied', 'This command is restricted to server admins.')] });
        return;
      }

      const seconds = checkAndSetCooldown(channelId, COOLDOWN_TIME);
      if (seconds > 0) {
        logger.info(`[STABLE] Cooldown hit by ${username} (${seconds}s left) in guild ${interaction.guildId}`);
        await interaction.editReply({ embeds: [errorEmbed('Cooldown', `Please wait ${seconds} seconds before updating the status channel again.`)] });
        return;
      }

      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel) throw new Error('Status channel not found.');
      await channel.setName('🟢┃Status : Stable (Latest)');
      await interaction.editReply({ content: `Status channel updated to: Stable (Latest)` });

      logger.info(`[STABLE] Status set to Stable by ${username} in guild ${interaction.guildId}`);
    } catch (err) {
      logger.error(`[STABLE] Error for ${username} in guild ${interaction.guildId}: ${err.stack || err}`);
      await interaction.editReply({ embeds: [errorEmbed('Error Updating Status', err.message)] });
    }
  }
};
