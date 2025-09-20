const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { loadResponses, upsertResponse, deleteResponse } = require('../utils/autoResponder');

const MOD_ROLE_ID = '1288633895910375464'; // <-- Set your mod role ID here

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Manage auto-responses for mods')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) // Or use custom logic for mod role
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
    // Only mods can use this command
    if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // List responses
    if (sub === 'list') {
      const responses = loadResponses();
      if (responses.length === 0) {
        await interaction.reply({ content: 'No auto-responses are configured.', ephemeral: true });
      } else {
        const out = responses.map(r =>
          `**Trigger:** \`${r.trigger}\` ${r.wildcard ? '*(wildcard)*' : ''}\n**Response:** ${r.response}`
        ).join('\n\n');
        await interaction.reply({ content: out, ephemeral: true });
      }
      return;
    }

    // Add response - show modal
    if (sub === 'add') {
      const modal = new ModalBuilder()
        .setCustomId('autoresponder_add')
        .setTitle('Add Auto-Response');
      const triggerInput = new TextInputBuilder()
        .setCustomId('trigger')
        .setLabel('Trigger Phrase')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. !bisect')
        .setRequired(true);
      const responseInput = new TextInputBuilder()
        .setCustomId('response')
        .setLabel('Response')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Bot reply for this trigger')
        .setRequired(true);
      const wildcardInput = new TextInputBuilder()
        .setCustomId('wildcard')
        .setLabel('Wildcard match? (yes/no)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('yes or no')
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
      const entry = loadResponses().find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
      if (!entry) {
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
        .setRequired(true);
      const responseInput = new TextInputBuilder()
        .setCustomId('response')
        .setLabel('Response')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(entry.response)
        .setRequired(true);
      const wildcardInput = new TextInputBuilder()
        .setCustomId('wildcard')
        .setLabel('Wildcard match? (yes/no)')
        .setStyle(TextInputStyle.Short)
        .setValue(entry.wildcard ? 'yes' : 'no')
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
      const entry = loadResponses().find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
      if (!entry) {
        await interaction.reply({ content: `No auto-response found for trigger: \`${trigger}\``, ephemeral: true });
        return;
      }
      deleteResponse(trigger);
      await interaction.reply({ content: `Deleted auto-response for trigger: \`${trigger}\``, ephemeral: true });
      return;
    }
  }
};
