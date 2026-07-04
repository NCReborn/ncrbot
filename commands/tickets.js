const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const TicketDatabase = require('../services/tickets/TicketDatabase');
const { ReportTypeSelectMenu } = require('../services/tickets/TicketViews');

const CONTACT_CHANNEL_ID = '1313246088556142602'; // #contact-the-team

const ticketDb = new TicketDatabase();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_tickets')
    .setDescription('Setup the ticket system with the initial embed message')
    .setDefaultMemberPermissions('Administrator'),
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.guild.channels.cache.get(CONTACT_CHANNEL_ID);
      if (!channel) {
        await interaction.editReply({
          content: '❌ Could not find the #contact-the-team channel',
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x2E86DE)
        .setTitle('📋 Contact the NCReborn Team')
        .setDescription('Select the type of report you\'d like to submit below.')
        .addFields(
          {
            name: 'Available Options:',
            value: '• **Report Suspicious DM** - Report suspicious direct messages\n' +
                   '• **Report Harassment** - Report harassment incidents\n' +
                   '• **Report Other Incident** - Report other incidents requiring support',
          }
        )
        .setFooter({ text: 'Please provide accurate details in your report' })
        .setTimestamp();

      const viewHandler = new ReportTypeSelectMenu(interaction.client, ticketDb);
      const menu = viewHandler.getMenu();

      const message = await channel.send({ embeds: [embed], components: [menu] });

      await interaction.editReply({
        content: `✅ Ticket system setup complete! Message ID: ${message.id}`,
      });

      logger.info(
        `[TICKETS] Setup completed by ${interaction.user.tag} in #${channel.name}`
      );
    } catch (err) {
      logger.error(`[TICKETS] Error in setup_tickets command: ${err.message}`);
      await interaction.editReply({
        content: `❌ Error setting up tickets: ${err.message}`,
      });
    }
  },
};
