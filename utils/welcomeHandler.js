const Canvas = require('canvas');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/welcomeConfig.json');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    if (!config.enabled) return;
    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel) return;

    // Load member avatar and custom image
    const avatar = await Canvas.loadImage(member.user.displayAvatarURL({ extension: 'png', size: 128 }));
    const welcomeImg = await Canvas.loadImage(config.logo);

    // Create canvas and draw images
    const canvas = Canvas.createCanvas(avatar.width + welcomeImg.width, Math.max(avatar.height, welcomeImg.height));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(avatar, 0, 0);
    ctx.drawImage(welcomeImg, avatar.width, 0);

    // Export combined image
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome-combined.png' });

    // Format message
    let welcomeMsg = config.message
      .replace('{server}', member.guild.name)
      .replace('{user}', `<@${member.id}>`)
      .replace('{userName}', member.user.username)
      .replace('{memberCount}', member.guild.memberCount);

    const embed = new EmbedBuilder()
      .setDescription(welcomeMsg)
      .setColor(config.embedColor || 0x2B2D31)
      .setImage('attachment://welcome-combined.png');

    await channel.send({ embeds: [embed], files: [attachment] });
  });
};
