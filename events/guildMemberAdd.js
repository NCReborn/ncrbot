const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const welcomeConfig = require('../config/welcomeConfig.json');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // keep your existing audit logging
      await auditLogger.logMemberJoined(client, member);

      const guildId = member.guild.id;

      // get this guild's welcome config (new: per‑guild)
      const guildConfig = welcomeConfig.guilds[guildId];
      if (!guildConfig || !guildConfig.enabled) return;

      const channel = member.guild.channels.cache.get(guildConfig.channelId);
      if (!channel) {
        logger.warn(`Welcome channel ${guildConfig.channelId} not found in guild ${guildId}`);
        return;
      }

      // this is the exact formatting logic your old system used
      const formattedMessage = guildConfig.message
        .replace('{server}', member.guild.name)
        .replace('{user}', `<@${member.id}>`)
        .replace('{memberCount}', member.guild.memberCount);

      const embed = new EmbedBuilder()
        .setColor(guildConfig.embedColor || '#2B2D31')
        .setDescription(formattedMessage)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setImage(guildConfig.logo)
        .setFooter({ text: guildConfig.embedFooter || '' })
        .setTimestamp();

      if (guildConfig.showUsernameBelowAvatar) {
        embed.setAuthor({
          name: member.user.username,
          iconURL: member.user.displayAvatarURL({ dynamic: true })
        });
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error('Error handling guildMemberAdd event:', error);
    }
  }
};
