const logger = require('../utils/logger');
const { handleLogScanTicketInteraction } = require('../utils/logScanTicket');
const { InteractionType } = require('discord.js');
const { upsertResponse } = require('../utils/autoResponder');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      await handleLogScanTicketInteraction(interaction);

      // Handle modal submit for autoresponder add/edit
      if (interaction.isModalSubmit() && (interaction.customId === 'autoresponder_add' || interaction.customId.startsWith('autoresponder_edit'))) {
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
        return; // Do not fall through to slash command handler
      }

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
