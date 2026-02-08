const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONSTANTS = require('../config/constants');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('initmegathread')
    .setDescription('Initialize the bugs and issues megathread with bot-managed embeds (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Verify we're in the megathread
      if (!interaction.channel.isThread()) {
        await interaction.editReply('❌ This command must be run inside the megathread!');
        return;
      }

      if (interaction.channel.id !== CONSTANTS.FORUM.MEGATHREAD_ID) {
        await interaction.editReply(`❌ This command can only be run in the configured megathread (ID: ${CONSTANTS.FORUM.MEGATHREAD_ID})`);
        return;
      }

      // Create the embeds
      const embeds = [
        new EmbedBuilder()
          .setDescription('## Bugs and issues MegaThread\n\nBelow will be a compiled list of common issues our community have, and a fix/solution given by our support team.\n\nThe best solution for each thread will be pinned posts. So always double check if the thread has any pinned messages')
          .setColor(15105570),
        
        new EmbedBuilder()
          .setDescription('## Read here before posting\n\nIt\'s important to use discords in-built search feature to look if your issue has already been solved. Our support team will proactively update this list and set relevant tags for posts made in this forum.')
          .setColor(3066993),
        
        new EmbedBuilder()
          .setDescription('## Collection Issues')
          .setColor(10181046),
        
        new EmbedBuilder()
          .setDescription('## Mod Issues')
          .setColor(15277667),
        
        new EmbedBuilder()
          .setDescription('## Installation Issues')
          .setColor(9134176)
      ];

      // Send the embeds
      const message = await interaction.channel.send({ embeds });

      logger.info(`[INIT_MEGATHREAD] Created megathread embeds message: ${message.id}`);

      await interaction.editReply({
        content: `✅ Megathread embeds created successfully!\n\n` +
                 `**Message ID:** ${message.id}\n` +
                 `**Message URL:** ${message.url}\n\n` +
                 `The bot will now be able to update these embeds automatically when tags are added to threads.\n\n` +
                 `⚠️ **Important:** Pin this message or keep it at the top of the megathread!`
      });

    } catch (error) {
      logger.error('[INIT_MEGATHREAD] Command error:', error);
      await interaction.editReply({
        content: '❌ An error occurred while creating the megathread embeds. Check bot logs for details.'
      });
    }
  }
};
