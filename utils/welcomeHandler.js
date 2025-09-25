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

    // Detect if user has custom avatar
    const isDefaultAvatar = !member.user.avatar;

    // Use default avatar URL if none set
    const avatarURL = isDefaultAvatar
      ? member.user.defaultAvatarURL
      : member.user.displayAvatarURL({ extension: 'png', size: targetHeight });

    const avatar = await Canvas.loadImage(avatarURL);
    const welcomeImgRaw = await Canvas.loadImage(config.logo);

    // Scale the banner to match targetHeight
    const bannerScale = targetHeight / welcomeImgRaw.height;
    const bannerWidth = Math.round(welcomeImgRaw.width * bannerScale);

    // Create canvas for side-by-side images
    const width = targetHeight + bannerWidth;
    const height = targetHeight;
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Optional: draw avatar as a circle for all users for consistency
    ctx.save();
    ctx.beginPath();
    ctx.arc(targetHeight / 2, targetHeight / 2, targetHeight / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    // Default avatars: "zoom in" a bit more to center the icon better
    if (isDefaultAvatar) {
      // These avatars are generally 128x128, but icon is small in the center
      // Zoom by cropping 24px on each side
      ctx.drawImage(avatar, 24, 24, 80, 80, 0, 0, targetHeight, targetHeight);
    } else {
      ctx.drawImage(avatar, 0, 0, targetHeight, targetHeight);
    }
    ctx.restore();

    // Draw banner at scaled size
    ctx.drawImage(welcomeImgRaw, targetHeight, 0, bannerWidth, targetHeight);

    // Draw username below avatar, centered and with a smaller font
    ctx.font = 'bold 16px Sans';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    const usernameY = targetHeight - 8;
    ctx.fillText(member.user.username, targetHeight / 2, usernameY);

    // Create image attachment
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome-combined.png' });

    // Send message and combined image
    await channel.send({
      content: welcomeMsg,
      files: [attachment]
    });
  });
};
