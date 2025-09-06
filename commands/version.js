const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { VERSION_INFO, VERSION_COOLDOWN_TIME } = require('../config/constants');
const { checkCooldown, setCooldown, cleanupOldCooldowns } = require('../utils/cooldownManager');

async function handleVersionCommand(message) {
  console.log('!version command received from:', message.author.tag);
  const now = Date.now();
  const cooldownKey = message.author.id;
  
  // Check if user is on cooldown (skip for administrators)
  const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);
  
  const timeLeft = checkCooldown(cooldownKey, VERSION_COOLDOWN_TIME);
  if (timeLeft > 0 && !isAdmin) {
    console.log('User is on cooldown');
    const cooldownEmbed = new EmbedBuilder()
      .setTitle('Command Cooldown')
      .setDescription(`Please wait ${timeLeft} more minutes before using the !version command again.`)
      .setColor(15548997);
    
    try {
      console.log('Attempting to send DM for cooldown');
      await message.author.send({ embeds: [cooldownEmbed] });
      console.log('DM sent successfully');
      
      if (message.deletable) {
        await message.delete().catch(error => console.log('Delete error (non-fatal):', error));
      }
    } catch (error) {
      console.error('Error sending DM:', error);
      const fallbackEmbed = new EmbedBuilder()
        .setTitle('Command Cooldown')
        .setDescription(`Please wait ${timeLeft} more minutes before using the !version command again.\n\n*(This message would normally be sent as a DM)*`)
        .setColor(15548997);
      await message.reply({ embeds: [fallbackEmbed] });
    }
    return;
  }
  
  // Set cooldown only for non-administrators
  if (!isAdmin) {
    setCooldown(cooldownKey, VERSION_COOLDOWN_TIME);
    console.log('Cooldown set for user:', cooldownKey);
  }
  
  // Clean up old cooldowns periodically
  if (Math.random() < 0.1) {
    cleanupOldCooldowns();
  }
  
  const versionEmbed = new EmbedBuilder()
    .setTitle('NCReborn CL Bot Version')
    .setDescription(`**Version:** ${VERSION_INFO.version}\n**Changes:** ${VERSION_INFO.changes}`)
    .setColor(5814783);
  
  await message.reply({ embeds: [versionEmbed] });
  console.log('Version response sent');
}

module.exports = {
  handleVersionCommand
};
