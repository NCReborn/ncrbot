const logger = require('../utils/logger');
const { handleLogScanTicketInteraction } = require('../utils/logScanTicket');
const { InteractionType } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      await handleLogScanTicketInteraction(interaction);

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
