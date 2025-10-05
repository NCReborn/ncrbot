const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { loadResponses, upsertResponse, deleteResponse } = require('../utils/autoResponder');

const MOD_ROLE_IDS = [
  '1370874936456908931',
  '1288633895910375464'
];

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
    console.log(`[autoresponder] Command invoked by ${interaction.user.tag} (${interaction.user.id})`);
    try {
      // Permission check
      const memberRoles = interaction.member?.roles?.cache;
      if (!memberRoles) {
        console.error('[autoresponder] No member roles found on interaction:', interaction.member);
        await interaction.reply({ content: 'Internal error: Cannot read member roles.', ephemeral: true });
        return;
      }
      const hasModRole = MOD_ROLE_IDS.some(id => memberRoles.has(id));
      console.log(`[autoresponder] User roles: ${Array.from(memberRoles.keys()).join(', ')} | Has mod role: ${hasModRole}`);
      if (!hasModRole) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
      }

      const sub = interaction.options.getSubcommand();
      console.log(`[autoresponder] Subcommand: ${sub}`);

      // List responses
      if (sub === 'list') {
        let responses;
        try {
          responses = loadResponses();
          console.log(`[autoresponder] Loaded responses:`, responses);
        } catch (err) {
          console.error('[autoresponder] Error loading responses:', err);
          await interaction.reply({ content: 'Failed to load auto-responses.', ephemeral: true });
          return;
        }
        if (!Array.isArray(responses)) {
          console.error('[autoresponder] Responses data is not an array:', responses);
          await interaction.reply({ content: 'Internal error: Responses data is not an array.', ephemeral: true });
          return;
        }
        if (responses.length === 0) {
          await interaction.reply({ content: 'No auto-responses are configured.', ephemeral: true });
        } else {
          const entries = responses.map(r =>
            `**Trigger:** \`${r.trigger}\` ${r.wildcard ? '*(wildcard)*' : ''}\n**Response:** ${r.response}`
          );
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
          console.log(`[autoresponder] Prepared ${chunks.length} chunks for reply`);
          await interaction.reply({ content: chunks[0], ephemeral: true });
          for (let i = 1; i < chunks.length; ++i) {
            await interaction.followUp({ content: chunks[i], ephemeral: true });
          }
        }
        return;
      }

      // Add response - show modal
      if (sub === 'add') {
        console.log('[autoresponder] Showing add modal');
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
        console.log(`[autoresponder] Edit requested for trigger: ${trigger}`);
        let entry;
        try {
          entry = loadResponses().find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
        } catch (err) {
          console.error('[autoresponder] Error loading responses for edit:', err);
          await interaction.reply({ content: 'Failed to load auto-responses.', ephemeral: true });
          return;
        }
        if (!entry) {
          console.log(`[autoresponder] No entry found for trigger: ${trigger}`);
          await interaction.reply({ content: `No auto-response found for trigger: \`${trigger}\``, ephemeral: true });
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
        console.log(`[autoresponder] Delete requested for trigger: ${trigger}`);
        let entry;
        try {
          entry = loadResponses().find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
        } catch (err) {
          console.error('[autoresponder] Error loading responses for delete:', err);
          await interaction.reply({ content: 'Failed to load auto-responses.', ephemeral: true });
          return;
        }
        if (!entry) {
          console.log(`[autoresponder] No entry found for delete trigger: ${trigger}`);
          await interaction.reply({ content: `No auto-response found for trigger: \`${trigger}\``, ephemeral: true });
          return;
        }
        try {
          deleteResponse(trigger);
          console.log(`[autoresponder] Deleted response for trigger: ${trigger}`);
        } catch (err) {
          console.error('[autoresponder] Error deleting response:', err);
          await interaction.reply({ content: `Failed to delete auto-response for trigger: \`${trigger}\``, ephemeral: true });
          return;
        }
        await interaction.reply({ content: `Deleted auto-response for trigger: \`${trigger}\``, ephemeral: true });
        return;
      }

      // Fallback if unknown subcommand
      console.warn(`[autoresponder] Unknown subcommand: ${sub}`);
      await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
    } catch (err) {
      console.error('[autoresponder] Uncaught error:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
      }
    }
  }
};
