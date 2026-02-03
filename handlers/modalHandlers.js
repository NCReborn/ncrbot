const logger = require('../utils/logger');
const { PermissionFlagsBits } = require('discord.js');
const { upsertResponse } = require('../utils/autoResponder');
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
      ephemeral: true 
    });
    
    logger.info(`[VERSION] Updated to ${version} by ${interaction.user.tag}`);
  }

  async handleAutoResponder(interaction) {
    const trigger = interaction.fields.getTextInputValue('trigger').trim();
    const response = interaction.fields.getTextInputValue('response').trim();
    const wildcardRaw = interaction.fields.getTextInputValue('wildcard').trim().toLowerCase();
    const wildcard = wildcardRaw === 'yes' || wildcardRaw === 'true' || wildcardRaw === '1';

    if (!trigger || !response) {
      await interaction.reply({ 
        content: 'Trigger and response are required.', 
        ephemeral: true 
      });
      return;
    }

    upsertResponse(trigger, response, wildcard);

    const action = interaction.customId === 'autoresponder_add' ? 'Added' : 'Updated';
    await interaction.reply({ 
      content: `${action} auto-response for trigger: \`${trigger}\``, 
      ephemeral: true 
    });
    
    logger.info(`[AUTORESPONDER] ${action} trigger "${trigger}" by ${interaction.user.tag}`);
  }

  async handleNCRBotMessage(interaction) {
    const guildMember = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command.', 
        ephemeral: true 
      });
      return;
    }

    const msg = interaction.fields.getTextInputValue('ncrbot_message');
    
    if (msg.length > 2000) {
      await interaction.reply({ 
        content: `Message too long (${msg.length}/2000).`, 
        ephemeral: true 
      });
      return;
    }

    await interaction.channel.send({ content: msg });
    await interaction.reply({ content: 'Message sent!', ephemeral: true });
    
    logger.info(`[NCRBOT_MSG] Posted by ${interaction.user.tag} in #${interaction.channel.name}`);
  }
}

module.exports = new ModalHandlers();
