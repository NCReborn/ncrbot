const Canvas = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const config = require('../config/welcomeConfig.json');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {

    // NEW: select correct guild config
    const guildId = member.guild.id;
    const guildConfig = config.guilds?.[guildId];
    if (!guildConfig || !guildConfig.enabled) return;

    const channel = member.guild.channels.cache.get(guildConfig.channelId);
    if (!channel) return;

    let welcomeMsg = guildConfig.message
      .replace('{server}', member.guild.name)
      .replace('{user}', `<@${member.id}>`)
      .replace('{userName}', member.user.username)
      .replace('{memberCount}', member.guild.memberCount);

    const targetHeight = 128;
    const isDefaultAvatar = !member.user.avatar;

    const avatarURL = isDefaultAvatar
      ? member.user.defaultAvatarURL
      : member.user.displayAvatarURL({ extension: 'png', size: targetHeight });

    const avatar = await Canvas.loadImage(avatarURL);
    const welcomeImgRaw = await Canvas.loadImage(guildConfig.logo);

    const bannerScale = targetHeight / welcomeImgRaw.height;
    const bannerWidth = Math.round(welcomeImgRaw.width * bannerScale);

    const width = targetHeight + bannerWidth;
    const height = targetHeight;
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.beginPath();
    ctx.arc(targetHeight / 2, targetHeight / 2, targetHeight / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    if (isDefaultAvatar) {
      ctx.drawImage(avatar, 24, 24, 80, 80, 0, 0, targetHeight, targetHeight);
    } else {
      ctx.drawImage(avatar, 0, 0, targetHeight, targetHeight);
    }
    ctx.restore();

    ctx.drawImage(welcomeImgRaw, targetHeight, 0, bannerWidth, targetHeight);

    if (guildConfig.showUsernameBelowAvatar) {
      ctx.font = 'bold 16px Sans';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(member.user.username, targetHeight / 2, targetHeight - 8);
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome-combined.png' });

    try {
      await channel.send({
        content: welcomeMsg,
        files: [attachment]
      });
    } catch (error) {
      console.error(`WelcomeHandler: Failed to send welcome message in guild ${guildId}`, error);
    }
  });
};
