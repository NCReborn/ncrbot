const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const mediaChannelService = require('../services/MediaChannelService');
const logger = require('../utils/logger');

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

    if (sub === 'add-image') {
      const channel = interaction.options.getChannel('channel');
      
      const result = mediaChannelService.addImageOnlyChannel(channel.id);
      
      if (!result.success) {
        return interaction.reply({ 
          content: `⚠️ <#${channel.id}> is already image-only.`, 
          ephemeral: true 
        });
      }
      
      logger.info(`[MEDIA_CHANNELS] Added image-only channel: ${channel.id} by ${interaction.user.tag}`);
      
      return interaction.reply({ 
        content: `✅ <#${channel.id}> added to image-only enforcement.`, 
        ephemeral: true 
      });
    }

    if (sub === 'remove-image') {
      const channel = interaction.options.getChannel('channel');
      
      const result = mediaChannelService.removeImageOnlyChannel(channel.id);
      
      if (!result.success) {
        return interaction.reply({ 
          content: `⚠️ <#${channel.id}> is not in the image-only list.`, 
          ephemeral: true 
        });
      }
      
      logger.info(`[MEDIA_CHANNELS] Removed image-only channel: ${channel.id} by ${interaction.user.tag}`);
      
      return interaction.reply({ 
        content: `✅ <#${channel.id}> removed from image-only enforcement.`, 
        ephemeral: true 
      });
    }

    if (sub === 'list') {
      const imageChannels = mediaChannelService.getImageOnlyChannels();
      const fileChannels = mediaChannelService.getFileOnlyChannels();
      
      const imageList = imageChannels.length > 0
        ? imageChannels.map(id => `<#${id}>`).join('\n')
        : '_None configured_';
        
      const fileList = fileChannels.length > 0
        ? fileChannels.map(id => `<#${id}>`).join('\n')
        : '_None configured_';
      
      return interaction.reply({
        content: `**Image-only channels:**\n${imageList}\n\n**File-only channels:**\n${fileList}`,
        ephemeral: true
      });
    }
  }
};
