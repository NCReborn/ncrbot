const Canvas = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const config = require('../config/welcomeConfig.json');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    if (!config.enabled) return;
    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel) return;

    let welcomeMsg = config.message
      .replace('{server}', member.guild.name)
      .replace('{user}', `<@${member.id}>`)
      .replace('{userName}', member.user.username)
      .replace('{memberCount}', member.guild.memberCount);

    // Load images
    const avatar = await Canvas.loadImage(member.user.displayAvatarURL({ extension: 'png', size: 128 }));
    const welcomeImg = await Canvas.loadImage(config.logo);

    // Create a canvas for side-by-side images
    const height = Math.max(avatar.height, welcomeImg.height);
    const width = avatar.width + welcomeImg.width;
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Vertically center the avatar
    const avatarY = (height - avatar.height) / 2;
    ctx.drawImage(avatar, 0, avatarY, avatar.width, avatar.height);

    // Vertically center the welcome image
    const welcomeY = (height - welcomeImg.height) / 2;
    ctx.drawImage(welcomeImg, avatar.width, welcomeY, welcomeImg.width, welcomeImg.height);

    // Draw the username below the avatar
    ctx.font = 'bold 28px Sans';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    // Position the text at the bottom of the avatar, but not below the canvas
    ctx.fillText(member.user.username, avatar.width / 2, avatarY + avatar.height + 28 < height ? avatarY + avatar.height + 24 : height - 10);

    // Create image attachment
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome-combined.png' });

    // Send message and combined image
    await channel.send({
      content: welcomeMsg,
      files: [attachment]
    });
  });
};
