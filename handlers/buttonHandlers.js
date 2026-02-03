const logger = require('../utils/logger');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const botcontrol = require('../commands/botcontrol');
const reloadModule = require('../commands/reload');

class ButtonHandlers {
  async handle(interaction, client) {
    const { customId } = interaction;

    if (['reload', 'mute', 'unmute', 'restart', 'stop'].includes(customId)) {
      await this.handleBotControl(interaction, client);
    }
  }

  async handleBotControl(interaction, client) {
    const { customId: id } = interaction;
    const adminOnly = ['restart', 'stop'];
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (adminOnly.includes(id) && !isAdmin) {
      await interaction.reply({ 
        content: 'This control is admin only.', 
        ephemeral: true 
      });
      return;
    }

    if (id === 'reload') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await reloadModule.reloadCommands(client, logger);
        await interaction.editReply({ content: 'Bot commands reloaded!' });
        logger.info(`[RELOAD] Commands reloaded by ${interaction.user.tag}`);
      } catch (error) {
        logger.error('[RELOAD] Failed:', error);
        await interaction.editReply({ content: 'Reload failed.' });
      }
      return;
    }

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
