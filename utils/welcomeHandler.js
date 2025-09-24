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

    // Set desired height for avatar and banner
    const targetHeight = 128;

    // Load and resize avatar
    const avatar = await Canvas.loadImage(member.user.displayAvatarURL({ extension: 'png', size: targetHeight }));
    // Load banner
    const welcomeImgRaw = await Canvas.loadImage(config.logo);

    // Scale the banner to match targetHeight
    const bannerScale = targetHeight / welcomeImgRaw.height;
    const bannerWidth = Math.round(welcomeImgRaw.width * bannerScale);

    // Create canvas for side-by-side images
    const width = avatar.width + bannerWidth;
    const height = targetHeight;
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw avatar (already target size)
    ctx.drawImage(avatar, 0, 0, avatar.width, avatar.height);

    // Draw banner at scaled size
    ctx.drawImage(welcomeImgRaw, avatar.width, 0, bannerWidth, targetHeight);

    // Draw username below avatar, centered
    ctx.font = 'bold 24px Sans';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(member.user.username, avatar.width / 2, height - 10);

    // Create image attachment
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome-combined.png' });

    // Send message and combined image
    await channel.send({
      content: welcomeMsg,
      files: [attachment]
    });
  });
};
