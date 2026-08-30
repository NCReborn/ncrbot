const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const welcomeConfig = require('../config/welcomeConfig.json');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // 1. Existing audit logging
      await auditLogger.logMemberJoined(client, member);

      // 2. Multi‑guild welcome system
      const guildId = member.guild.id;
      const guildConfig = welcomeConfig.guilds[guildId];
      if (!guildConfig) return;

      // 3. Correct field name: channelId
      const channel = member.guild.channels.cache.get(guildConfig.channelId);
      if (!channel) {
        logger.warn(`Welcome channel ${guildConfig.channelId} not found in guild ${guildId}`);
        return;
      }

      // 4. Build embed
      const embed = new EmbedBuilder()
        .setColor(guildConfig.embedColor || '#00ff9f')
        .setDescription(
          guildConfig.message
            .replace('{server}', member.guild.name)
            .replace('{user}', `<@${member.id}>`)
            .replace('{memberCount}', member.guild.memberCount)
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setImage(guildConfig.logo)
        .setFooter({ text: guildConfig.embedFooter || '' })
        .setTimestamp();

      // 5. Send welcome
      await channel.send({ embeds: [embed] });

    } catch (error) {
      logger.error('Error handling guildMemberAdd event:', error);
    }
  }
};
