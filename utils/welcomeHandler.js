const { EmbedBuilder } = require('discord.js');
const config = require('../config/welcomeConfig.json');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    if (!config.enabled) return;
    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel) return;

    // Format message with variables
    let welcomeMsg = config.message
      .replace('{server}', member.guild.name)
      .replace('{user}', `<@${member.id}>`)
      .replace('{userName}', member.user.username)
      .replace('{memberCount}', member.guild.memberCount);

    // Create an embed similar to ProBot
    const embed = new EmbedBuilder()
      .setDescription(welcomeMsg)
      .setColor(0x2B2D31)
      .setImage(config.image);

    // Send avatar and username + main welcome image, matching your screenshot
    await channel.send({
      content: null,
      files: [{
        attachment: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
        name: 'avatar.png'
      }, {
        attachment: config.image,
        name: 'welcome.png'
      }],
      embeds: [embed]
    });

    // Optionally, send username below avatar (as in your screenshot)
    await channel.send(`**${member.user.username}**`);
  });
};
