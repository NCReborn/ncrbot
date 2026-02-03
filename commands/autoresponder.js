const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { loadResponses, upsertResponse, deleteResponse } = require('../utils/autoResponder');
const { PermissionChecker } = require('../utils/permissions');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Manage auto-responses for mods')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all auto-responses')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new auto-response')
    )
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit an existing auto-response')
        .addStringOption(opt =>
          opt.setName('trigger')
            .setDescription('The trigger phrase to edit')
            .setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete an auto-response')
        .addStringOption(opt =>
          opt.setName('trigger')
            .setDescription('The trigger phrase to delete')
            .setRequired(true))
    ),
  async execute(interaction) {
    logger.info(`[AUTORESPONDER] Command invoked by ${interaction.user.tag} (${interaction.user.id})`);
    try {
      // Permission check
      const memberRoles = interaction.member?.roles?.cache;
      if (!memberRoles) {
        logger.error('[AUTORESPONDER] No member roles found on interaction:', interaction.member);
        await interaction.reply({ content: 'Internal error: Cannot read member roles.', flags: MessageFlags.Ephemeral });
        return;
      }
      const hasModRole = PermissionChecker.hasModRole(interaction.member);
      logger.info(`[AUTORESPONDER] User roles: ${Array.from(memberRoles.keys()).join(', ')} | Has mod role: ${hasModRole}`);
      if (!hasModRole) {
        await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        return;
      }

      const sub = interaction.options.getSubcommand();
      logger.info(`[AUTORESPONDER] Subcommand: ${sub}`);

      // List responses
      if (sub === 'list') {
        let responses;
        try {
          responses = loadResponses();
          logger.info('[AUTORESPONDER] Loaded responses:', responses);
        } catch (err) {
          logger.error('[AUTORESPONDER] Error loading responses:', err);
          await interaction.reply({ content: 'Failed to load auto-responses.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (!Array.isArray(responses)) {
          logger.error('[AUTORESPONDER] Responses data is not an array:', responses);
          await interaction.reply({ content: 'Internal error: Responses data is not an array.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (responses.length === 0) {
          await interaction.reply({ content: 'No auto-responses are configured.', flags: MessageFlags.Ephemeral });
        } else {
          // Helper function to suppress embeds by wrapping URLs in angle brackets
          function suppressEmbeds(text) {
            // Match URLs and wrap them in angle brackets to prevent embeds
            return text.replace(/(https?:\/\/[^\s]+)/g, '<$1>');
          }

          const entries = responses.map(r => {
            // Suppress embeds in the response text
            const responseText = suppressEmbeds(r.response);
            return `**Trigger:** \`${r.trigger}\` ${r.wildcard ? '*(wildcard)*' : ''}\n**Response:** ${responseText}`;
          });
          
          let chunk = '';
          let chunks = [];
          for (const entry of entries) {
            if ((chunk + '\n\n' + entry).length > 1990) {
              chunks.push(chunk);
              chunk = entry;
            } else {
              chunk += (chunk ? '\n\n' : '') + entry;
            }
          }
          if (chunk) chunks.push(chunk);
          logger.info(`[AUTORESPONDER] Prepared ${chunks.length} chunks for reply`);
          await interaction.reply({ content: chunks[0], flags: MessageFlags.Ephemeral });
          for (let i = 1; i < chunks.length; ++i) {
            await interaction.followUp({ content: chunks[i], flags: MessageFlags.Ephemeral });
          }
        }
        return;
      }

      // Add response - show modal
      if (sub === 'add') {
        logger.info('[AUTORESPONDER] Showing add modal');
        const modal = new ModalBuilder()
          .setCustomId('autoresponder_add')
          .setTitle('Add Auto-Response');

        const triggerInput = new TextInputBuilder()
          .setCustomId('trigger')
          .setLabel('Trigger Phrase')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. !bisect — the word or phrase that triggers the response')
          .setRequired(true);

        const responseInput = new TextInputBuilder()
          .setCustomId('response')
          .setLabel('Response')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("The bot's reply. Can be multi-line and contain links.")
          .setRequired(true);

        const wildcardInput = new TextInputBuilder()
          .setCustomId('wildcard')
          .setLabel('Wildcard match? (yes/no)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('yes = match anywhere in message; no = exact match only')
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(triggerInput),
          new ActionRowBuilder().addComponents(responseInput),
          new ActionRowBuilder().addComponents(wildcardInput)
        );
        await interaction.showModal(modal);
        return;
      }

      // Edit response - show modal with prefilled values
      if (sub === 'edit') {
        const trigger = interaction.options.getString('trigger');
        logger.info(`[AUTORESPONDER] Edit requested for trigger: ${trigger}`);
        let entry;
        try {
          entry = loadResponses().find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
        } catch (err) {
          logger.error('[AUTORESPONDER] Error loading responses for edit:', err);
          await interaction.reply({ content: 'Failed to load auto-responses.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (!entry) {
          logger.info(`[AUTORESPONDER] No entry found for trigger: ${trigger}`);
          await interaction.reply({ content: `No auto-response found for trigger: \`${trigger}\``, flags: MessageFlags.Ephemeral });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`autoresponder_edit:${trigger}`)
          .setTitle('Edit Auto-Response');

        const triggerInput = new TextInputBuilder()
          .setCustomId('trigger')
          .setLabel('Trigger Phrase')
          .setStyle(TextInputStyle.Short)
          .setValue(entry.trigger)
          .setPlaceholder('e.g. !bisect — the word or phrase that triggers the response')
          .setRequired(true);

        const responseInput = new TextInputBuilder()
          .setCustomId('response')
          .setLabel('Response')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(entry.response)
          .setPlaceholder("The bot's reply. Can be multi-line and contain links.")
          .setRequired(true);

        const wildcardInput = new TextInputBuilder()
          .setCustomId('wildcard')
          .setLabel('Wildcard match? (yes/no)')
          .setStyle(TextInputStyle.Short)
          .setValue(entry.wildcard ? 'yes' : 'no')
          .setPlaceholder('yes = match anywhere in message; no = exact match only')
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(triggerInput),
          new ActionRowBuilder().addComponents(responseInput),
          new ActionRowBuilder().addComponents(wildcardInput)
        );
        await interaction.showModal(modal);
        return;
      }

      // Delete response
      if (sub === 'delete') {
        const trigger = interaction.options.getString('trigger');
        logger.info(`[AUTORESPONDER] Delete requested for trigger: ${trigger}`);
        let entry;
        try {
          entry = loadResponses().find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
        } catch (err) {
          logger.error('[AUTORESPONDER] Error loading responses for delete:', err);
          await interaction.reply({ content: 'Failed to load auto-responses.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (!entry) {
          logger.info(`[AUTORESPONDER] No entry found for delete trigger: ${trigger}`);
          await interaction.reply({ content: `No auto-response found for trigger: \`${trigger}\``, flags: MessageFlags.Ephemeral });
          return;
        }
        try {
          deleteResponse(trigger);
          logger.info(`[AUTORESPONDER] Deleted response for trigger: ${trigger}`);
        } catch (err) {
          logger.error('[AUTORESPONDER] Error deleting response:', err);
          await interaction.reply({ content: `Failed to delete auto-response for trigger: \`${trigger}\``, flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply({ content: `Deleted auto-response for trigger: \`${trigger}\``, flags: MessageFlags.Ephemeral });
        return;
      }

      // Fallback if unknown subcommand
      logger.warn(`[AUTORESPONDER] Unknown subcommand: ${sub}`);
      await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      logger.error('[AUTORESPONDER] Uncaught error:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
      }
    }
  }
};
