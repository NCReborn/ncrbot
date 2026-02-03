const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const configPath = path.join(__dirname, '../config/imageOnlyConfig.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    logger.error('[MEDIA_CHANNELS] Failed to load config:', error);
    return { imageOnlyChannels: [], fileOnlyChannels: [] };
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    logger.info('[MEDIA_CHANNELS] Config saved');
  } catch (error) {
    logger.error('[MEDIA_CHANNELS] Failed to save config:', error);
    throw error;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mediachannels')
    .setDescription('Manage media-only channel enforcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('add-image')
        .setDescription('Add a channel to image-only enforcement')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to add')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove-image')
        .setDescription('Remove a channel from image-only enforcement')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to remove')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all media-enforced channels')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = loadConfig();

    if (sub === 'add-image') {
      const channel = interaction.options.getChannel('channel');
      
      if (config.imageOnlyChannels.includes(channel.id)) {
        return interaction.reply({ 
          content: `⚠️ <#${channel.id}> is already image-only.`, 
          ephemeral: true 
        });
      }
      
      config.imageOnlyChannels.push(channel.id);
      saveConfig(config);
      
      logger.info(`[MEDIA_CHANNELS] Added image-only channel: ${channel.id} by ${interaction.user.tag}`);
      
      return interaction.reply({ 
        content: `✅ <#${channel.id}> added to image-only enforcement.`, 
        ephemeral: true 
      });
    }

    if (sub === 'remove-image') {
      const channel = interaction.options.getChannel('channel');
      
      if (!config.imageOnlyChannels.includes(channel.id)) {
        return interaction.reply({ 
          content: `⚠️ <#${channel.id}> is not in the image-only list.`, 
          ephemeral: true 
        });
      }
      
      config.imageOnlyChannels = config.imageOnlyChannels.filter(id => id !== channel.id);
      saveConfig(config);
      
      logger.info(`[MEDIA_CHANNELS] Removed image-only channel: ${channel.id} by ${interaction.user.tag}`);
      
      return interaction.reply({ 
        content: `✅ <#${channel.id}> removed from image-only enforcement.`, 
        ephemeral: true 
      });
    }

    if (sub === 'list') {
      const imageChannels = config.imageOnlyChannels?.length > 0
        ? config.imageOnlyChannels.map(id => `<#${id}>`).join('\n')
        : '_None configured_';
        
      const fileChannels = config.fileOnlyChannels?.length > 0
        ? config.fileOnlyChannels.map(id => `<#${id}>`).join('\n')
        : '_None configured_';
      
      return interaction.reply({
        content: `**Image-only channels:**\n${imageChannels}\n\n**File-only channels:**\n${fileChannels}`,
        ephemeral: true
      });
    }
  }
};
