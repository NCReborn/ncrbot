const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auditlog')
    .setDescription('Configure audit logging settings (Admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Toggle an audit event on/off')
        .addStringOption(option =>
          option
            .setName('event')
            .setDescription('The audit event to toggle')
            .setRequired(true)
            .addChoices(
              { name: 'Member Banned', value: 'guildBanAdd' },
              { name: 'Member Unbanned', value: 'guildBanRemove' },
              { name: 'Member Joined', value: 'guildMemberAdd' },
              { name: 'Member Left/Kicked', value: 'guildMemberRemove' },
              { name: 'Member Updated (roles/nickname)', value: 'guildMemberUpdate' },
              { name: 'Member Timeout', value: 'guildMemberTimeout' },
              { name: 'Message Deleted', value: 'messageDelete' },
              { name: 'Message Edited', value: 'messageUpdate' },
              { name: 'Channel Created', value: 'channelCreate' },
              { name: 'Channel Deleted', value: 'channelDelete' },
              { name: 'Channel Updated', value: 'channelUpdate' },
              { name: 'Thread Created', value: 'threadCreate' },
              { name: 'Thread Deleted', value: 'threadDelete' },
              { name: 'Thread Updated', value: 'threadUpdate' }
            )
        )
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable this event')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('channel')
        .setDescription('Set the audit log channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to send audit logs to')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View current audit logging configuration')
    ),

  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command. Administrator permissions required.', 
        ephemeral: true 
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'toggle') {
        const eventName = interaction.options.getString('event');
        const enabled = interaction.options.getBoolean('enabled');

        const success = auditLogger.toggleEvent(eventName, enabled);
        
        if (success) {
          const eventConfig = auditLogger.getEventConfig(eventName);
          await interaction.reply({
            content: `✅ **${eventConfig.name}** audit logging has been **${enabled ? 'enabled' : 'disabled'}**.`,
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to toggle event. Event not found.',
            ephemeral: true
          });
        }

      } else if (subcommand === 'channel') {
        const channel = interaction.options.getChannel('channel');
        
        if (!channel.isTextBased()) {
          await interaction.reply({
            content: '❌ The audit log channel must be a text channel.',
            ephemeral: true
          });
          return;
        }

        // Test if bot can send messages to this channel
        try {
          await channel.send('🔍 Testing audit log permissions...').then(msg => msg.delete());
        } catch (error) {
          await interaction.reply({
            content: `❌ I don't have permission to send messages in ${channel}. Please ensure I have Send Messages and Embed Links permissions.`,
            ephemeral: true
          });
          return;
        }

        auditLogger.setAuditChannel(channel.id);
        
        await interaction.reply({
          content: `✅ Audit log channel has been set to ${channel}.`,
          ephemeral: true
        });

      } else if (subcommand === 'status') {
        const auditChannelId = auditLogger.getAuditChannel();
        const events = auditLogger.getAllEvents();

        const embed = new EmbedBuilder()
          .setTitle('🔍 Audit Log Configuration')
          .setColor(0x5865f2)
          .setTimestamp();

        if (auditChannelId) {
          embed.addFields([
            { 
              name: 'Audit Channel', 
              value: `<#${auditChannelId}>`, 
              inline: true 
            }
          ]);
        } else {
          embed.addFields([
            { 
              name: 'Audit Channel', 
              value: '❌ Not configured', 
              inline: true 
            }
          ]);
        }

        const enabledEvents = [];
        const disabledEvents = [];

        for (const [eventKey, eventConfig] of Object.entries(events)) {
          if (eventConfig.enabled) {
            enabledEvents.push(`${eventConfig.emoji} ${eventConfig.name}`);
          } else {
            disabledEvents.push(`${eventConfig.emoji} ${eventConfig.name}`);
          }
        }

        if (enabledEvents.length > 0) {
          embed.addFields([
            { 
              name: '✅ Enabled Events', 
              value: enabledEvents.join('\n'), 
              inline: true 
            }
          ]);
        }

        if (disabledEvents.length > 0) {
          embed.addFields([
            { 
              name: '❌ Disabled Events', 
              value: disabledEvents.join('\n'), 
              inline: true 
            }
          ]);
        }

        embed.setFooter({
          text: 'Use /auditlog toggle to enable/disable events • /auditlog channel to set audit channel'
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }

    } catch (error) {
      logger.error('Error in auditlog command:', error);
      await interaction.reply({
        content: '❌ An error occurred while processing the command.',
        ephemeral: true
      });
    }
  }
};