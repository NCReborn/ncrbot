const { SlashCommandBuilder } = require('discord.js');
const config = require('../config/imageOnlyConfig.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('listmediachannels')
    .setDescription('List all image-only and file-only channels.'),
  async execute(interaction) {
    const imageChannels = config.imageOnlyChannels.map(id => `<#${id}>`).join('\n') || 'None set';
    const fileChannels = config.fileOnlyChannels.map(id => `<#${id}>`).join('\n') || 'None set';

    await interaction.reply({
      content:
        `**Image-only channels:**\n${imageChannels}\n\n**File-only channels:**\n${fileChannels}`,
      ephemeral: true
    });
  }
};
