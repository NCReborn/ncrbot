const logger = require('../utils/logger');
const { InteractionType } = require('discord.js');
const { handleLogScanTicketInteraction } = require('../utils/logScanTicket');

const modalHandlers = require('../handlers/modalHandlers');
const buttonHandlers = require('../handlers/buttonHandlers');
const commandHandlers = require('../handlers/commandHandlers');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // Handle log scan ticket interactions
      await handleLogScanTicketInteraction(interaction);

      // Route to appropriate handler
      if (interaction.isModalSubmit()) {
        await modalHandlers.handle(interaction, client);
      } else if (interaction.isButton()) {
        await buttonHandlers.handle(interaction, client);
      } else if (interaction.type === InteractionType.ApplicationCommand) {
        await commandHandlers.handle(interaction, client);
      }
    } catch (error) {
      logger.error('[INTERACTION] Unhandled error:', error);
      
      const errorMessage = { 
        content: 'An unexpected error occurred.', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else if (interaction.isRepliable()) {
        await interaction.reply(errorMessage).catch(() => {});
      }
    }
  }
};
