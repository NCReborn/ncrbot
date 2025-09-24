module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    const config = require('../config/welcomeConfig.json');
    if (!config.enabled) return;
    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel) return;

    // Format message with variables
    let welcomeMsg = config.message
      .replace('{server}', member.guild.name)
      .replace('{user}', `<@${member.id}>`)
      .replace('{userName}', member.user.username)
      .replace('{memberCount}', member.guild.memberCount);

    // Send regular message (not embed)
    await channel.send(welcomeMsg);

    // Send avatar and welcome image as files (side-by-side)
    await channel.send({
      files: [
        {
          attachment: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
          name: 'avatar.png'
        },
        {
          attachment: config.logo,
          name: 'welcome.png'
        }
      ]
    });

    // Send username below avatar
    if (config.showUsernameBelowAvatar) {
      await channel.send(`**${member.user.username}**`);
    }
  });
};
