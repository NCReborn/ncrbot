// commands/mediachannels.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mediaChannelService = require('../../services/MediaChannelService');
const logger = require('../../utils/logger');

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
    const guildId = interaction.guild.id;   // ⭐ FIXED
    const sub = interaction.options.getSubcommand();

    if (sub === 'add-image') {
      const channel = interaction.options.getChannel('channel');

      // ⭐ FIXED: pass guildId first, channel.id second
      const result = mediaChannelService.addImageOnlyChannel(guildId, channel.id);

      if (!result.success) {
        return interaction.reply({
          content: `⚠️ <#${channel.id}> is already image-only.`,
          flags: MessageFlags.Ephemeral
        });
      }

      logger.info(`[MEDIA_CHANNELS] Added image-only channel ${channel.id} in guild ${guildId}`);
      return interaction.reply({
        content: `✅ <#${channel.id}> added to image-only enforcement.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'remove-image') {
      const channel = interaction.options.getChannel('channel');

      // ⭐ FIXED: pass guildId first
      const result = mediaChannelService.removeImageOnlyChannel(guildId, channel.id);

      if (!result.success) {
        return interaction.reply({
          content: `⚠️ <#${channel.id}> is not in the image-only list.`,
          flags: MessageFlags.Ephemeral
        });
      }

      logger.info(`[MEDIA_CHANNELS] Removed image-only channel ${channel.id} in guild ${guildId}`);
      return interaction.reply({
        content: `✅ <#${channel.id}> removed from image-only enforcement.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'list') {
      const imageChannels = mediaChannelService.getImageOnlyChannels(guildId);  // ⭐ FIXED
      const fileChannels = mediaChannelService.getFileOnlyChannels(guildId);    // ⭐ FIXED

      const imageList = imageChannels.length > 0
        ? imageChannels.map(id => `<#${id}>`).join('\n')
        : '_None configured_';

      const fileList = fileChannels.length > 0
        ? fileChannels.map(id => `<#${id}>`).join('\n')
        : '_None configured_';

      return interaction.reply({
        content: `**Image-only channels:**\n${imageList}\n\n**File-only channels:**\n${fileList}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
