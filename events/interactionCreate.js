const logger = require('../utils/logger');
const { InteractionType } = require('discord.js');
const { handleLogScanTicketInteraction } = require('../utils/logScanTicket');

const modalHandlers = require('../handlers/modalHandlers');
const buttonHandlers = require('../handlers/buttonHandlers');
const commandHandlers = require('../handlers/commandHandlers');
const { loadResponses, upsertResponse } = require('../utils/autoResponder');

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
      } else if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('autoresponder_channels:')) {
        await handleAutoResponderChannelSelect(interaction);
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

async function handleAutoResponderChannelSelect(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.update({
      content: 'This action can only be used in a server.',
      components: []
    });
    return;
  }

  const trigger = interaction.customId.slice('autoresponder_channels:'.length);
  const selectedChannelIds = interaction.values; // array of channel ID strings

  const existing = loadResponses(guildId).find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
  if (!existing) {
    await interaction.update({
      content: `Could not find auto-response for trigger \`${trigger}\`. It may have been deleted.`,
      components: []
    });
    return;
  }

  // Validate selected channels belong to this guild
  const guildChannelIds = new Set(interaction.guild.channels.cache.keys());
  const validChannelIds = selectedChannelIds.filter(id => guildChannelIds.has(id));

  upsertResponse(guildId, existing.trigger, existing.response, existing.wildcard, validChannelIds);

  const scopeMsg =
    validChannelIds.length > 0
      ? `Now scoped to: ${validChannelIds.map(id => `<#${id}>`).join(', ')}`
      : 'Now global (triggers in all channels).';

  logger.info(`[AUTORESPONDER] Channel scope updated for trigger "${trigger}" by ${interaction.user.tag}: [${validChannelIds.join(', ')}]`);

  await interaction.update({
    content: `✅ Channel scope updated for trigger \`${trigger}\`.\n${scopeMsg}`,
    components: []
  });
}
