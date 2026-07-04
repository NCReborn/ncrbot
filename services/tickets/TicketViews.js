const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

const SUPPORT_TICKET_CATEGORY_ID = '1400977595499282653';
const FIXERS_ROLE_ID = '1370874936456908931';

class ReportTypeSelectMenu {
  constructor(client, db) {
    this.client = client;
    this.db = db;
  }

  getMenu() {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_report_type')
      .setPlaceholder('Select the type of report...')
      .addOptions([
        {
          label: '🚨 Report Suspicious DM',
          value: 'suspicious_dm',
          description: 'Report suspicious direct messages',
        },
        {
          label: '⚠️ Report Harassment',
          value: 'harassment',
          description: 'Report harassment incidents',
        },
        {
          label: '📋 Report Other Incident',
          value: 'other',
          description: 'Report other incidents requiring support',
        },
      ]);

    return new ActionRowBuilder().addComponents(menu);
  }

  async handleSelect(interaction) {
    const reportType = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`ticket_form_${reportType}`)
      .setTitle(this.getModalTitle(reportType));

    const fields = this.getFormFields(reportType);
    fields.forEach((field) => modal.addComponents(field));

    await interaction.showModal(modal);
  }

  getModalTitle(reportType) {
    const titles = {
      suspicious_dm: '🚨 Report Suspicious DM',
      harassment: '⚠️ Report Harassment',
      other: '📋 Report Other Incident',
    };
    return titles[reportType] || 'Support Ticket';
  }

  getFormFields(reportType) {
    const commonFields = [
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_reporter_identifier')
          .setLabel('Username or Discord ID of reported user')
          .setPlaceholder('e.g., username#0000 or 123456789')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_details')
          .setLabel('Detailed description of the incident')
          .setPlaceholder(
            'Please provide as much detail as possible...'
          )
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
    ];

    if (reportType === 'suspicious_dm') {
      commonFields.splice(
        1,
        0,
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_dm_context')
            .setLabel('Brief context of the DM')
            .setPlaceholder(
              'e.g., what was the initial message about?'
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    }

    return commonFields;
  }

  async handleFormSubmit(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const reportType = interaction.customId.split('_')[2];
      const reportedUser = interaction.fields.getTextInputValue(
        'ticket_reporter_identifier'
      );
      const details = interaction.fields.getTextInputValue('ticket_details');

      // Create ticket
      const ticketId = uuidv4();
      const guild = interaction.guild;
      const user = interaction.user;

      // Create private channel
      const fixersRole = guild.roles.cache.get(FIXERS_ROLE_ID);
      if (!fixersRole) {
        await interaction.editReply({
          content:
            '❌ Error: Fixers role not found. Please contact an administrator.',
        });
        logger.error('[TICKETS] Fixers role not found');
        return;
      }

      const channel = await guild.channels.create({
        name: `ticket-${ticketId.substring(0, 8)}`,
        type: 0, // Text channel
        parent: SUPPORT_TICKET_CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: fixersRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      });

      // Save ticket to database
      const dmContext =
        reportType === 'suspicious_dm'
          ? interaction.fields.getTextInputValue('ticket_dm_context')
          : 'N/A';

      const fullDetails = `**Reported User:** ${reportedUser}\n**DM Context:** ${dmContext}\n\n${details}`;

      await this.db.createTicket({
        ticket_id: ticketId,
        guild_id: guild.id,
        channel_id: channel.id,
        opened_by: user.id,
        opened_by_name: user.username,
        report_type: reportType,
        details: fullDetails,
      });

      // Send initial message to ticket channel
      const reportTypeEmoji = {
        suspicious_dm: '🚨',
        harassment: '⚠️',
        other: '📋',
      };

      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle(
          `${reportTypeEmoji[reportType]} Support Ticket Opened`
        )
        .addFields(
          { name: 'Ticket ID', value: ticketId, inline: false },
          { name: 'Report Type', value: this.getReportTypeLabel(reportType), inline: true },
          {
            name: 'Opened by',
            value: `${user.username} (${user.id})`,
            inline: true,
          },
          {
            name: 'Reported User',
            value: reportedUser,
            inline: true,
          },
          {
            name: 'Report Details',
            value: fullDetails,
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: 'Support Team: Please review and take action' });

      const closeButton = new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(closeButton);

      await channel.send({ embeds: [embed], components: [row] });

      await interaction.editReply({
        content: `✅ Ticket created successfully! Channel: <#${channel.id}>`,
      });

      logger.info(
        `[TICKETS] Ticket ${ticketId} created by ${user.tag}`
      );
    } catch (err) {
      logger.error(`[TICKETS] Error handling form submit: ${err.message}`);
      await interaction.editReply({
        content: '❌ An error occurred while creating your ticket.',
      });
    }
  }

  getReportTypeLabel(reportType) {
    const labels = {
      suspicious_dm: 'Suspicious DM',
      harassment: 'Harassment',
      other: 'Other Incident',
    };
    return labels[reportType] || 'Unknown';
  }
}

class TicketCloseView {
  constructor(client, db) {
    this.client = client;
    this.db = db;
  }

  async handleClose(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const ticketId = await this.db.getTicketByChannel(
        interaction.channel.id
      );
      if (!ticketId) {
        await interaction.editReply({
          content: '❌ Ticket not found',
        });
        return;
      }

      const ticket = await this.db.getTicket(ticketId);
      if (!ticket) {
        await interaction.editReply({
          content: '❌ Ticket not found in database',
        });
        return;
      }

      if (ticket.status === 'closed') {
        await interaction.editReply({
          content: '❌ This ticket is already closed',
        });
        return;
      }

      // Generate transcript
      const transcript = await this.generateTranscript(
        interaction.channel,
        ticket
      );

      // Create close embed
      const closeEmbed = new EmbedBuilder()
        .setColor('#00B894')
        .setTitle('🔒 Ticket Closed')
        .addFields(
          {
            name: 'Closed by',
            value: `${interaction.user.username} (${interaction.user.id})`,
            inline: false,
          },
          {
            name: 'Closed at',
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: false,
          },
          {
            name: 'Report Type',
            value: this.getReportTypeLabel(ticket.report_type),
            inline: true,
          },
          {
            name: 'Ticket ID',
            value: ticket.ticket_id,
            inline: true,
          }
        )
        .setTimestamp();

      const reopenButton = new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Reopen Ticket')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(reopenButton);

      // Send close message
      await interaction.channel.send({ embeds: [closeEmbed], components: [row] });

      // Update database
      await this.db.updateTicket(ticketId, {
        status: 'closed',
        closed_by: interaction.user.id,
        closed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        transcript: transcript,
      });

      await interaction.editReply({
        content: '✅ Ticket closed successfully',
      });

      logger.info(
        `[TICKETS] Ticket ${ticketId} closed by ${interaction.user.tag}`
      );
    } catch (err) {
      logger.error(`[TICKETS] Error closing ticket: ${err.message}`);
      await interaction.editReply({
        content: '❌ Error closing ticket',
      });
    }
  }

  async handleReopen(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const ticketId = await this.db.getTicketByChannel(
        interaction.channel.id
      );
      if (!ticketId) {
        await interaction.editReply({
          content: '❌ Ticket not found',
        });
        return;
      }

      const ticket = await this.db.getTicket(ticketId);
      if (!ticket) {
        await interaction.editReply({
          content: '❌ Ticket not found in database',
        });
        return;
      }

      // Check permissions (only OP or staff can reopen)
      const fixersRole = interaction.guild.roles.cache.get(FIXERS_ROLE_ID);
      const isStaff = fixersRole && interaction.member.roles.has(fixersRole.id);
      const isOp = interaction.user.id === ticket.opened_by;

      if (!isStaff && !isOp) {
        await interaction.editReply({
          content:
            '❌ Only the ticket opener or staff can reopen tickets',
        });
        return;
      }

      if (ticket.status !== 'closed') {
        await interaction.editReply({
          content: '❌ This ticket is not closed',
        });
        return;
      }

      // Update ticket
      await this.db.updateTicket(ticketId, {
        status: 'open',
        reopened_by: interaction.user.id,
        reopened_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });

      // Send reopen notification
      const reopenEmbed = new EmbedBuilder()
        .setColor('#0984E3')
        .setTitle('🔓 Ticket Reopened')
        .addFields(
          {
            name: 'Reopened by',
            value: `${interaction.user.username}`,
            inline: true,
          },
          {
            name: 'Reopened at',
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: true,
          }
        )
        .setTimestamp();

      const closeButton = new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(closeButton);

      await interaction.channel.send({ embeds: [reopenEmbed], components: [row] });

      await interaction.editReply({
        content: '✅ Ticket reopened successfully',
      });

      logger.info(
        `[TICKETS] Ticket ${ticketId} reopened by ${interaction.user.tag}`
      );
    } catch (err) {
      logger.error(`[TICKETS] Error reopening ticket: ${err.message}`);
      await interaction.editReply({
        content: '❌ Error reopening ticket',
      });
    }
  }

  async generateTranscript(channel, ticket) {
    try {
      const lines = [
        `═══════════════════════════════════════`,
        `Ticket ID: ${ticket.ticket_id}`,
        `Report Type: ${this.getReportTypeLabel(ticket.report_type)}`,
        `Opened by: ${ticket.opened_by_name} (${ticket.opened_by})`,
        `Opened at: ${ticket.created_at}`,
        `Closed by: ${ticket.closed_by || 'Unknown'} (${ticket.closed_at || 'N/A'})`,
        `Report Details:\n${ticket.details}`,
        `═══════════════════════════════════════`,
        `CONVERSATION HISTORY:\n`,
      ];

      // Fetch messages from channel
      const messages = await channel.messages.fetch({ limit: 100 });
      const sortedMessages = Array.from(messages.values()).reverse();

      for (const message of sortedMessages) {
        const timestamp = message.createdTimestamp;
        const date = new Date(timestamp);
        const timeStr = date.toLocaleString();
        const content = message.content || '[No content]';
        lines.push(`[${timeStr}] ${message.author.username}: ${content}`);
      }

      return lines.join('\n');
    } catch (err) {
      logger.error(`[TICKETS] Error generating transcript: ${err.message}`);
      return 'Error generating transcript';
    }
  }

  getReportTypeLabel(reportType) {
    const labels = {
      suspicious_dm: 'Suspicious DM',
      harassment: 'Harassment',
      other: 'Other Incident',
    };
    return labels[reportType] || 'Unknown';
  }
}

module.exports = { ReportTypeSelectMenu, TicketCloseView };
