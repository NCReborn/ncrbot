const logger = require('../utils/logger');
const ticketHandlers = require('../handlers/ticketHandlers');
const TicketDatabase = require('../services/tickets/TicketDatabase');

const ticketDb = new TicketDatabase();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      const { customId, isStringSelectMenu, isModalSubmit, isButton } = interaction;

      // Only handle ticket-related interactions
      if (
        (isStringSelectMenu && customId === 'ticket_report_type') ||
        (isModalSubmit && customId?.startsWith('ticket_form_')) ||
        (isButton && (customId === 'ticket_close' || customId === 'ticket_reopen'))
      ) {
        // Initialize database on first interaction
        await ticketDb.initialize();
        await ticketHandlers.handle(interaction, client);
      }
    } catch (err) {
      logger.error(`[TICKETS] Error in interactionCreate: ${err.message}`);
    }
  },
};
