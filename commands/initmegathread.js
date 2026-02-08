const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONSTANTS = require('../config/constants');
const forumManager = require('../services/ForumManager');
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

      // Get the forum channel to fetch existing threads
      const forumChannel = interaction.channel.parent;

      // Create the static embeds first
      const embeds = [
        new EmbedBuilder()
          .setDescription('## Bugs and issues MegaThread\n\nBelow will be a compiled list of common issues our community have, and a fix/solution given by our support team.\n\nThe best solution for each thread will be pinned posts. So always double check if the thread has any pinned messages')
          .setColor(15105570),
        
        new EmbedBuilder()
          .setDescription('## Read here before posting\n\nIt\'s important to use discords in-built search feature to look if your issue has already been solved. Our support team will proactively update this list and set relevant tags for posts made in this forum.')
          .setColor(3066993),
      ];

      // Dynamically create category embeds with existing threads
      await interaction.editReply('🔄 Scanning forum for existing threads...');

      for (const [tagName, tagConfig] of Object.entries(CONSTANTS.FORUM.TAG_CONFIG)) {
        // Fetch threads with this tag
        const threads = await forumManager.getThreadsByTag(forumChannel, tagName);
        
        // Build description with thread links
        let description = `## ${tagConfig.section}`;
        if (threads.length > 0) {
          description += '\n' + threads.map(t => `https://discord.com/channels/${t.guildId}/${t.id}`).join('\n');
        }

        embeds.push(
          new EmbedBuilder()
            .setDescription(description)
            .setColor(tagConfig.color)
        );
      }

      // Send the embeds
      const message = await interaction.channel.send({ embeds });

      logger.info(`[INIT_MEGATHREAD] Created megathread embeds message: ${message.id}`);

      const threadCounts = embeds.slice(2).map((embed, i) => {
        const tagName = Object.keys(CONSTANTS.FORUM.TAG_CONFIG)[i];
        const tagConfig = CONSTANTS.FORUM.TAG_CONFIG[tagName];
        const threadCount = (embed.data.description.match(/https:\/\/discord\.com/g) || []).length;
        return `• ${tagConfig.section}: ${threadCount} thread${threadCount !== 1 ? 's' : ''}`;
      }).join('\n');

      await interaction.editReply({
        content: `✅ Megathread embeds created and populated with existing threads!\n\n` +
                 `**Message ID:** ${message.id}\n` +
                 `**Message URL:** ${message.url}\n\n` +
                 `**Threads Added:**\n${threadCounts}\n\n` +
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
