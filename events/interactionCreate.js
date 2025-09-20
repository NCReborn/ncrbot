const logger = require('../utils/logger');
const { handleLogScanTicketInteraction } = require('../utils/logScanTicket');
const { InteractionType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { upsertResponse } = require('../utils/autoResponder');

// Import bot control logic and persistent status helpers
const botcontrol = require('../commands/botcontrol.js');
const {
  saveStatus,
  postOrUpdateControlPanel,
} = require('../commands/botcontrol.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      await handleLogScanTicketInteraction(interaction);

      // Handle modal submit for autoresponder add/edit
      if (interaction.isModalSubmit() && (interaction.customId === 'autoresponder_add' || interaction.customId.startsWith('autoresponder_edit'))) {
        const trigger = interaction.fields.getTextInputValue('trigger').trim();
        const response = interaction.fields.getTextInputValue('response').trim();
        const wildcardRaw = interaction.fields.getTextInputValue('wildcard').trim().toLowerCase();
        const wildcard = wildcardRaw === 'yes' || wildcardRaw === 'true' || wildcardRaw === '1';

        if (!trigger || !response) {
          await interaction.reply({ content: 'Trigger and response are required.', ephemeral: true });
          return;
        }

        upsertResponse(trigger, response, wildcard);

        if (interaction.customId === 'autoresponder_add') {
          await interaction.reply({ content: `Added new auto-response for trigger: \`${trigger}\``, ephemeral: true });
        } else {
          await interaction.reply({ content: `Updated auto-response for trigger: \`${trigger}\``, ephemeral: true });
        }
        return; // Do not fall through to slash command handler
      }

      // Handle modal submit for NCRBot
      if (interaction.isModalSubmit() && interaction.customId === 'ncrbot_modal') {
        // Get a complete GuildMember object to check permissions reliably
        const guildMember = await interaction.guild.members.fetch(interaction.user.id);
        if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
          return;
        }
        const msg = interaction.fields.getTextInputValue('ncrbot_message');
        if (msg.length > 2000) {
          await interaction.reply({ content: `Message too long (${msg.length}/2000).`, ephemeral: true });
          return;
        }
        await interaction.channel.send({ content: msg });
        await interaction.reply({ content: 'Message sent!', ephemeral: true });
        return;
      }

      // --- Bot Control Panel Button Handler ---
      if (interaction.isButton()) {
        const id = interaction.customId;
        const adminOnly = ['restart', 'stop'];
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        let needsPanelUpdate = false;

        if (adminOnly.includes(id) && !isAdmin) {
          await interaction.reply({ content: 'This control is admin only.', ephemeral: true });
          return;
        }

        let resultMsg = '';
        switch (id) {
          case 'reload':
            resultMsg = 'Bot commands reloaded!';
            break;
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
          default:
            resultMsg = 'Unknown control!';
        }

        saveStatus(botcontrol.botStatus);

        if (needsPanelUpdate) {
          // Update the panel message with refreshed status
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

        // If restart: simulate process exit after reply (real implementation may differ)
        if (id === 'restart') {
          setTimeout(() => process.exit(0), 1000);
        }
        // For stop: you may want to also call process.exit() or similar.
        return;
      }

      // Slash command handler
      if (interaction.type === InteractionType.ApplicationCommand) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
          await command.execute(interaction);
        } catch (error) {
          logger.error(error.stack || error);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
          } else {
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
          }
        }
      }
    } catch (err) {
      logger.error(`[INTERACTION_CREATE] Uncaught error: ${err.stack || err}`);
      if (interaction && interaction.isRepliable && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: 'An unexpected error occurred processing your request.', ephemeral: true });
        } catch(e) {
          logger.error(`[INTERACTION_CREATE] Failed to reply to interaction: ${e.stack || e}`);
        }
      }
    }
  }
};
