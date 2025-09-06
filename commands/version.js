const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { VERSION_INFO, VERSION_COOLDOWN_TIME } = require('../config/constants');
const { checkCooldown, setCooldown, cleanupCooldowns } = require('../utils/cooldownManager');

module.exports = {
  handleVersionCommand: async (message) => {
    const now = Date.now();
    const cooldownKey = `${message.author.id}-version`;
    const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);
    
    // Check cooldown
    const cooldownEndTime = checkCooldown(cooldownKey);
    if (now < cooldownEndTime && !isAdmin) {
      const timeLeft = Math.ceil((cooldownEndTime - now) / 1000 / 60);
      await handleCooldown(message, timeLeft);
      return;
    }
    
    // Set cooldown for non-admins
    if (!isAdmin) {
      setCooldown(cooldownKey, now + VERSION_COOLDOWN_TIME);
    }
    
    // Cleanup old cooldowns
    cleanupCooldowns();
    
    // Send version info
    const versionEmbed = new EmbedBuilder()
      .setTitle('NCReborn CL Bot Version')
      .setDescription(`**Version:** ${VERSION_INFO.version}\n**Changes:** ${VERSION_INFO.changes}`)
      .setColor(5814783);
    
    await message.reply({ embeds: [versionEmbed] });
  }
};

async function handleCooldown(message, timeLeft) {
  const cooldownEmbed = new EmbedBuilder()
    .setTitle('Command Cooldown')
    .setDescription(`Please wait ${timeLeft} more minutes before using the !version command again.`)
    .setColor(15548997);
  
  try {
    await message.author.send({ embeds: [cooldownEmbed] });
    if (message.deletable) {
      await message.delete().catch(() => {});
    }
  } catch (error) {
    await message.reply({ embeds: [cooldownEmbed] });
  }
}