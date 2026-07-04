const logger = require('../utils/logger');
const TicketDatabase = require('../services/tickets/TicketDatabase');
const { ReportTypeSelectMenu, TicketCloseView } = require('../services/tickets/TicketViews');

const ticketDb = new TicketDatabase();

class TicketHandlers {
  async handle(interaction, client) {
    const { customId, isStringSelectMenu, isModalSubmit, isButton } = interaction;

    if (isStringSelectMenu && customId === 'ticket_report_type') {
      const viewHandler = new ReportTypeSelectMenu(client, ticketDb);
      await viewHandler.handleSelect(interaction);
    } else if (isModalSubmit && customId.startsWith('ticket_form_')) {
      const viewHandler = new ReportTypeSelectMenu(client, ticketDb);
      await viewHandler.handleFormSubmit(interaction);
    } else if (isButton && customId === 'ticket_close') {
      const closeView = new TicketCloseView(client, ticketDb);
      await closeView.handleClose(interaction);
    } else if (isButton && customId === 'ticket_reopen') {
      const closeView = new TicketCloseView(client, ticketDb);
      await closeView.handleReopen(interaction);
    }
  }
}

module.exports = new TicketHandlers();
