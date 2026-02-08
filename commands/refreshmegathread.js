const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const forumManager = require('../services/ForumManager');
const CONSTANTS = require('../config/constants');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refreshmegathread')
    .setDescription('Manually refresh the bugs and issues megathread (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('tag')
        .setDescription('Specific tag to refresh (optional - refreshes all if not specified)')
        .setRequired(false)
        .addChoices(
          { name: 'Collection Issues', value: 'Collection issues' },
          { name: 'Mod Issues', value: 'Mod issues' },
          { name: 'Installation Issues', value: 'Installation issues' },
          { name: 'All Tags', value: 'all' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const specificTag = interaction.options.getString('tag');
      const tagsToUpdate = specificTag && specificTag !== 'all' 
        ? [specificTag]
        : Object.keys(CONSTANTS.FORUM.TAG_CONFIG);

      let successCount = 0;
      for (const tagName of tagsToUpdate) {
        const success = await forumManager.updateMegathread(interaction.client, tagName);
        if (success) successCount++;
      }

      if (successCount === tagsToUpdate.length) {
        await interaction.editReply({
          content: `✅ Successfully refreshed ${successCount} section(s) in the megathread!`
        });
      } else {
        await interaction.editReply({
          content: `⚠️ Partially successful: ${successCount}/${tagsToUpdate.length} sections updated. Check logs for details.`
        });
      }

    } catch (error) {
      logger.error('[REFRESH_MEGATHREAD] Command error:', error);
      await interaction.editReply({
        content: '❌ An error occurred while refreshing the megathread. Check bot logs for details.'
      });
    }
  }
};
