const logger = require('../utils/logger');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const spamActionHandler = require('../services/spam/SpamActionHandler');
const nsfwActionHandler = require('../services/nsfw/NsfwActionHandler');
const { handleLeaderboardButton } = require('../commands/streetcred');

class ButtonHandlers {
  async handle(interaction, client) {
    const { customId } = interaction;

    if (['reload', 'mute', 'unmute', 'restart', 'stop'].includes(customId)) {
      await this.handleBotControl(interaction, client);
    } else if (customId.startsWith('spam_')) {
      await spamActionHandler.handleModAction(interaction);
    } else if (customId.startsWith('nsfw_')) {
      await nsfwActionHandler.handleModAction(interaction, client);
    } else if (customId.startsWith('sc_lb_')) {
      await handleLeaderboardButton(interaction);
    }
  }

  async handleBotControl(interaction, client) {
    const { customId: id } = interaction;
    const adminOnly = ['restart', 'stop', 'reload'];
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (adminOnly.includes(id) && !isAdmin) {
      await interaction.reply({ 
        content: 'This control is admin only.', 
        ephemeral: true 
      });
      return;
    }

    // Handle reload - currently disabled
    if (id === 'reload') {
      await interaction.reply({ 
        content: '⚠️ Reload functionality is currently disabled. Please restart the bot instead.', 
        ephemeral: true 
      });
      return;
    }

    // Handle other controls
    let resultMsg = '';

    switch (id) {
      case 'mute':
        resultMsg = 'Mute functionality is no longer supported.';
        break;
      case 'unmute':
        resultMsg = 'Unmute functionality is no longer supported.';
        break;
      case 'restart':
        resultMsg = 'Bot is restarting...';
        logger.info(`[RESTART] Initiated by ${interaction.user.tag}`);
        setTimeout(() => process.exit(0), 1000);
        break;
      case 'stop':
        resultMsg = 'Bot is stopping. Emergency shutdown in progress!';
        logger.info(`[STOP] Initiated by ${interaction.user.tag}`);
        setTimeout(() => process.exit(1), 1000);
        break;
    }

    await interaction.deferUpdate();
    await interaction.followUp({ content: resultMsg, ephemeral: true });
  }
}

module.exports = new ButtonHandlers();
