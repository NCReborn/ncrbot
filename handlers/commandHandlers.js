const logger = require('../utils/logger');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const CONSTANTS = require('../config/constants');

class CommandHandlers {
  async handle(interaction, client) {
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
      logger.warn(`[COMMAND] Unknown command: ${interaction.commandName}`);
      return;
    }

    const adminOnlyCommands = ['stable', 'investigating', 'issues', 'updating', 'pending'];
    if (adminOnlyCommands.includes(interaction.commandName)) {
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        await interaction.reply({ 
          content: 'You do not have permission to use this command.', 
          ephemeral: true 
        });
        return;
      }
    }

    try {
      await command.execute(interaction);
      await this.handleStatusChannelUpdate(interaction);
      
    } catch (error) {
      logger.error(`[COMMAND] Error executing ${interaction.commandName}:`, error);
      
      const errorMessage = { 
        content: 'There was an error executing this command!', 
        ephemeral: true 
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else {
        await interaction.reply(errorMessage).catch(() => {});
      }
    }
  }

  async handleStatusChannelUpdate(interaction) {
    const statusCommands = ['stable', 'investigating', 'issues', 'updating', 'pending'];
    
    if (!statusCommands.includes(interaction.commandName)) {
      return;
    }

    const statusConfig = {
      investigating: { emoji: '🟡', label: 'Issues Reported (Latest)' },
      issues: { emoji: '🔴', label: 'Issues Detected (Latest)' },
      updating: { emoji: '🔵', label: 'Updating soon (Latest)' },
      stable: { emoji: '🟢', label: 'Stable (Latest)' },
      pending: { emoji: '⏳', label: 'Pending (Core Mods)' },
    };

    const config = statusConfig[interaction.commandName];
    if (!config) return;

    try {
      const statusChannel = await interaction.client.channels.fetch(CONSTANTS.CHANNELS.STATUS);
      if (statusChannel && statusChannel.type === ChannelType.GuildText) {
        await statusChannel.setTopic(`${config.emoji} | Status: ${config.label}`);
      }
    } catch (error) {
      logger.warn('[STATUS] Failed to update channel topic:', error);
    }
  }
}

module.exports = new CommandHandlers();
