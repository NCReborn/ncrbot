const logger = require('../utils/logger');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const botcontrol = require('../commands/botcontrol');
const spamActionHandler = require('../services/spam/SpamActionHandler');

class ButtonHandlers {
  async handle(interaction, client) {
    const { customId } = interaction;

    if (['reload', 'mute', 'unmute', 'restart', 'stop'].includes(customId)) {
      await this.handleBotControl(interaction, client);
    } else if (customId.startsWith('spam_')) {
      await spamActionHandler.handleModAction(interaction);
    }
  }

  async handleBotControl(interaction, client) {
    const { customId: id } = interaction;
    const adminOnly = ['restart', 'stop', 'reload']; // Add reload to admin-only
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (adminOnly.includes(id) && !isAdmin) {
      await interaction.reply({ 
        content: 'This control is admin only.', 
        ephemeral: true 
      });
      return;
    }

    // Handle reload - inline without requiring separate module
    if (id === 'reload') {
      await interaction.reply({ 
        content: '⚠️ Reload functionality is currently disabled. Please restart the bot instead.', 
        ephemeral: true 
      });
      return;
    }

    // Handle other controls
    let resultMsg = '';
    let needsPanelUpdate = false;

    switch (id) {
      case 'mute':
        botcontrol.botStatus.muted = true;
        needsPanelUpdate = true;
        resultMsg = 'Bot has been muted.';
        break;
      case 'unmute':
        botcontrol.botStatus.muted = false;
        needsPanelUpdate = true;
        resultMsg = 'Bot has been unmuted.';
        break;
      case 'restart':
        resultMsg = 'Bot is restarting...';
        needsPanelUpdate = true;
        break;
      case 'stop':
        botcontrol.botStatus.running = false;
        needsPanelUpdate = true;
        resultMsg = 'Bot is stopping. Emergency shutdown in progress!';
        break;
    }

    botcontrol.saveStatus(botcontrol.botStatus);

    if (needsPanelUpdate) {
      const embed = EmbedBuilder.from(interaction.message.embeds[0]);
      embed.data.fields = embed.data.fields.map(f =>
        f.name === 'Bot Status'
          ? { name: f.name, value: botcontrol.getStatusText() }
          : f
      );
      await interaction.update({ embeds: [embed] });
    } else {
      await interaction.deferUpdate();
    }

    await interaction.followUp({ content: resultMsg, ephemeral: true });

    if (id === 'restart') {
      logger.info(`[RESTART] Initiated by ${interaction.user.tag}`);
      setTimeout(() => process.exit(0), 1000);
    }
  }
}

module.exports = new ButtonHandlers();
