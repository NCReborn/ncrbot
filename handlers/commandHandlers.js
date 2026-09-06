const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');

class CommandHandlers {
  async handle(interaction, client) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`[COMMAND] Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);

    } catch (error) {
      logger.error(`[COMMAND] Error executing ${interaction.commandName}:`, error);

      const errorMessage = {
        content: 'There was an error executing this command!',
        flags: MessageFlags.Ephemeral
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else {
        await interaction.reply(errorMessage).catch(() => {});
      }
    }
  }
}

module.exports = new CommandHandlers();
