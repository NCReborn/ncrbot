const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VERSION_INFO, VERSION_COOLDOWN_TIME } = require('../config/constants');
const { checkCooldown, setCooldown, cleanupOldCooldowns } = require('../utils/cooldownManager');
const logger = require('../utils/logger');
const { errorEmbed } = require('../utils/discordUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show the bot version and recent changes.'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = `${interaction.user.tag} (${interaction.user.id})`;

    try {
      const cooldownKey = interaction.user.id;
      const timeLeft = checkCooldown(cooldownKey, VERSION_COOLDOWN_TIME);

      if (timeLeft > 0) {
        logger.info(`[VERSION] Cooldown hit for ${username} (${timeLeft} min left)`);
        await interaction.editReply({ embeds: [errorEmbed('Command Cooldown', `Please wait ${timeLeft} more minutes before using the version command again.`)] });
        return;
      }

      setCooldown(cooldownKey, VERSION_COOLDOWN_TIME);
      if (Math.random() < 0.1) cleanupOldCooldowns();

      const versionEmbed = new EmbedBuilder()
        .setTitle('NCReborn CL Bot Version')
        .setDescription(`**Version:** ${VERSION_INFO.version}\n**Changes:** ${VERSION_INFO.changes}`)
        .setColor(5814783);

      await interaction.editReply({ embeds: [versionEmbed] });
      logger.info(`[VERSION] Version info shown to ${username}`);
    } catch (err) {
      logger.error(`[VERSION] Error for ${username}: ${err.message}`);
      await interaction.editReply({ embeds: [errorEmbed('Error Getting Version', err.message)] });
    }
  }
};
