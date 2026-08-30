const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const welcomeConfig = require('../config/welcomeConfig.json');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      //
      // 1. Existing audit logging (keep this)
      //
      await auditLogger.logMemberJoined(client, member);

      //
      // 2. Multi‑guild welcome system
      //
      const guildId = member.guild.id;

      // Check if this guild has a welcome config block
      const guildConfig = welcomeConfig.guilds[guildId];
      if (!guildConfig) {
        // No welcome config for this guild — silently skip
        return;
      }

      // Resolve welcome channel
      const channel = member.guild.channels.cache.get(guildConfig.welcomeChannel);
      if (!channel) {
        logger.warn(`Welcome channel ${guildConfig.welcomeChannel} not found in guild ${guildId}`);
        return;
      }

      //
      // 3. Build the welcome embed
      //
      const embed = new EmbedBuilder()
        .setColor(guildConfig.color || '#00ff9f')
        .setTitle(guildConfig.welcomeMessage)
        .setDescription(
          guildConfig.description ||
          `Welcome <@${member.id}>!\nYou are member **#${member.guild.memberCount}** 🎉`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setImage(guildConfig.image)
        .setTimestamp();

      //
      // 4. Send the welcome message
      //
      await channel.send({ embeds: [embed] });

    } catch (error) {
      logger.error('Error handling guildMemberAdd event:', error);
    }
  }
};
