const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const auditLogger = require('../../utils/auditLogger');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auditlog')
    .setDescription('Configure audit logging settings (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'toggle') {
        const eventName = interaction.options.getString('event');
        const enabled = interaction.options.getBoolean('enabled');
        const guildId = interaction.guildId;

        const success = auditLogger.toggleEvent(guildId, eventName, enabled);
        
        if (success) {
          const eventConfig = auditLogger.getEventConfig(guildId, eventName);
          await interaction.reply({
            content: `✅ **${eventConfig.name}** audit logging has been **${enabled ? 'enabled' : 'disabled'}** for this server.`,
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to toggle event. Event not found.',
            flags: MessageFlags.Ephemeral
          });
        }

      } else if (subcommand === 'channel') {
        const channel = interaction.options.getChannel('channel');
        
        if (!channel.isTextBased()) {
          await interaction.reply({
            content: '❌ The audit log channel must be a text channel.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (channel.guildId !== interaction.guildId) {
          await interaction.reply({
            content: '❌ The audit log channel must belong to this server.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Test if bot can send messages to this channel
        try {
          await channel.send('🔍 Testing audit log permissions...').then(msg => msg.delete());
        } catch (error) {
          await interaction.reply({
            content: `❌ I don't have permission to send messages in ${channel}. Please ensure I have Send Messages and Embed Links permissions.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        auditLogger.setAuditChannel(interaction.guildId, channel.id);
        
        await interaction.reply({
          content: `✅ Audit log channel has been set to ${channel} for this server.`,
          flags: MessageFlags.Ephemeral
        });

      } else if (subcommand === 'status') {
        const guildConfig = auditLogger.getGuildConfig(interaction.guildId);
        const auditChannelId = auditLogger.getAuditChannel(interaction.guildId);
        const events = auditLogger.getAllEvents(interaction.guildId) || {};
        const hasGuildConfig = Boolean(guildConfig);

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

        if (hasGuildConfig) {
          for (const eventConfig of Object.values(events)) {
            if (eventConfig.enabled) {
              enabledEvents.push(`${eventConfig.emoji} ${eventConfig.name}`);
            } else {
              disabledEvents.push(`${eventConfig.emoji} ${eventConfig.name}`);
            }
          }
        }

        if (!hasGuildConfig) {
          embed.addFields([
            {
              name: 'Events',
              value: 'ℹ️ No guild-specific audit settings saved yet. Set an audit channel to initialize logging for this server.',
              inline: false
            }
          ]);
        } else if (enabledEvents.length > 0) {
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
          text: 'This server only • Use /auditlog toggle to enable/disable events • /auditlog channel to set audit channel'
        });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

    } catch (error) {
      logger.error('Error in auditlog command:', error);
      await interaction.reply({
        content: '❌ An error occurred while processing the command.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
