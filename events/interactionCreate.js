const logger = require('../utils/logger');
const { handleLogScanTicketInteraction } = require('../utils/logScanTicket');
const { InteractionType, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { upsertResponse } = require('../utils/autoResponder');
const botcontrol = require('../commands/botcontrol.js');
const { saveStatus, postOrUpdateControlPanel } = require('../commands/botcontrol.js');
const reloadModule = require('../commands/reload.js');
const addcommand = require('../commands/addcommand.js');
const fs = require('fs');
const path = require('path');
const VERSION_FILE = path.join(__dirname, '../data/versionInfo.json');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      await handleLogScanTicketInteraction(interaction);

      // --- Handle /setversion modal submission ---
      if (interaction.isModalSubmit() && interaction.customId === 'setVersionModal') {
        const version = interaction.fields.getTextInputValue('version');
        const changes = interaction.fields.getTextInputValue('changes');
        fs.writeFileSync(VERSION_FILE, JSON.stringify({ version, changes }, null, 2));
        await interaction.reply({ content: `Version updated to **${version}**!`, ephemeral: true });
        return;
      }

      // Handle modal submit for autoresponder add/edit
      if (
        interaction.isModalSubmit() &&
        (interaction.customId === 'autoresponder_add' ||
          interaction.customId.startsWith('autoresponder_edit'))
      ) {
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
        return;
      }

      // Handle modal submit for NCRBot
      if (interaction.isModalSubmit() && interaction.customId === 'ncrbot_modal') {
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

      // --- Handle modal submit for /addcommand ---
      if (interaction.isModalSubmit() && interaction.customId === 'addcommand_modal') {
        await addcommand.handleModalSubmit(interaction);
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

        // Reload button: clean confirmation, no debug
        if (id === 'reload') {
          await interaction.deferReply({ ephemeral: true });
          try {
            await reloadModule.reloadCommands(client, logger);
            await interaction.editReply({ content: 'Bot commands reloaded!' });
          } catch {
            await interaction.editReply({ content: 'Reload failed.' });
          }
          return;
        }

        let resultMsg = '';
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

        saveStatus(botcontrol.botStatus);

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
          setTimeout(() => process.exit(0), 1000);
        }
        return;
      }

      // Slash command handler
      if (interaction.type === InteractionType.ApplicationCommand) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // --- Only allow admins to use status commands ---
        const adminOnlyCommands = ['stable', 'investigating', 'issues', 'updating', 'pending'];
        if (adminOnlyCommands.includes(interaction.commandName)) {
          const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
          if (!isAdmin) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
          }
        }

        try {
          // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
          // PATCH: Do NOT auto-defer slash commands here.
          // Let command files handle defer/reply/modal as needed!
          // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
          await command.execute(interaction);

          // --- Only update the #bot-controls channel topic after a status slash command ---
          const statusCommands = ['stable', 'investigating', 'issues', 'updating', 'pending'];
          if (statusCommands.includes(interaction.commandName)) {
            const statusConfig = {
              investigating: {
                emoji: '🟡',
                label: 'Issues Reported (Latest)'
              },
              issues: {
                emoji: '🔴',
                label: 'Issues Detected (Latest)'
              },
              updating: {
                emoji: '🔵',
                label: 'Updating soon (Latest)'
              },
              stable: {
                emoji: '🟢',
                label: 'Stable (Latest)'
              },
              pending: {
                emoji: '⏳',
                label: 'Pending (Core Mods)'
              }
            };
            const config = statusConfig[interaction.commandName];
            if (config) {
              const statusChannelId = '1395501617523986644';
              try {
                const statusChannel = await interaction.client.channels.fetch(statusChannelId);
                if (statusChannel && statusChannel.type === ChannelType.GuildText) {
                  await statusChannel.setTopic(`${config.emoji} | Status: ${config.label}`);
                }
              } catch (e) {
                logger.warn('Failed to update status channel topic:', e);
              }
            }
          }
        } catch (err) {
          if (interaction.replied || interaction.deferred) {
            try {
              await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            } catch { /* ignore if already replied */ }
          } else {
            try {
              await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            } catch { /* ignore if already replied */ }
          }
        }
      }
    } catch {
      // Clean, no debug/log output to user, just silent fail
      if (interaction && interaction.isRepliable && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: 'An unexpected error occurred processing your request.', ephemeral: true });
        } catch { /* silent */ }
      }
    }
  }
};
