const logger = require('../utils/logger');
const { PermissionFlagsBits, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, MessageFlags } = require('discord.js');
const { upsertResponse, loadResponses } = require('../utils/autoResponder');
const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '../data/versionInfo.json');

class ModalHandlers {
  async handle(interaction, client) {
    const { customId } = interaction;

    if (customId === 'setVersionModal') {
      await this.handleSetVersion(interaction);
    } else if (customId === 'autoresponder_add' || customId.startsWith('autoresponder_edit')) {
      await this.handleAutoResponder(interaction);
    } else if (customId === 'ncrbot_modal') {
      await this.handleNCRBotMessage(interaction);
    }
  }

  async handleSetVersion(interaction) {
    const version = interaction.fields.getTextInputValue('version');
    const changes = interaction.fields.getTextInputValue('changes');
    
    fs.writeFileSync(VERSION_FILE, JSON.stringify({ version, changes }, null, 2));
    await interaction.reply({ 
      content: `Version updated to **${version}**!`, 
      flags: MessageFlags.Ephemeral 
    });
    
    logger.info(`[VERSION] Updated to ${version} by ${interaction.user.tag}`);
  }

  async handleAutoResponder(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This action can only be used in a server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const trigger = interaction.fields.getTextInputValue('trigger').trim();
    const response = interaction.fields.getTextInputValue('response').trim();
    const wildcardRaw = interaction.fields.getTextInputValue('wildcard').trim().toLowerCase();
    const wildcard = wildcardRaw === 'yes' || wildcardRaw === 'true' || wildcardRaw === '1';

    if (!trigger || !response) {
      await interaction.reply({ 
        content: 'Trigger and response are required.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Preserve existing allowedChannelIds when editing
    const existing = loadResponses(guildId).find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
    const allowedChannelIds = existing?.allowedChannelIds ?? [];

    upsertResponse(guildId, trigger, response, wildcard, allowedChannelIds);

    const action = interaction.customId === 'autoresponder_add' ? 'Added' : 'Updated';
    logger.info(`[AUTORESPONDER] ${action} trigger "${trigger}" by ${interaction.user.tag}`);

    // Follow-up with a channel select menu for optional channel scoping
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`autoresponder_channels:${trigger}`)
      .setPlaceholder('Select channels (leave empty to trigger in all channels)')
      .setMinValues(0)
      .setMaxValues(25)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildVoice);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    const currentScope =
      allowedChannelIds.length > 0
        ? `Currently scoped to: ${allowedChannelIds.map(id => `<#${id}>`).join(', ')}`
        : 'Currently global (all channels).';

    await interaction.reply({
      content:
        `${action} auto-response for trigger: \`${trigger}\`\n\n` +
        `${currentScope}\n` +
        `Use the menu below to restrict this trigger to specific channels, or dismiss to keep the current scope.`,
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }

  async handleNCRBotMessage(interaction) {
    const guildMember = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const msg = interaction.fields.getTextInputValue('ncrbot_message');
    
    if (msg.length > 2000) {
      await interaction.reply({ 
        content: `Message too long (${msg.length}/2000).`, 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    await interaction.channel.send({ content: msg });
    await interaction.reply({ content: 'Message sent!', flags: MessageFlags.Ephemeral });
    
    logger.info(`[NCRBOT_MSG] Posted by ${interaction.user.tag} in #${interaction.channel.name}`);
  }
}

module.exports = new ModalHandlers();
