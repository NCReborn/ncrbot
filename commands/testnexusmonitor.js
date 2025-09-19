const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');
const NexusCommentMonitor = require('../services/nexusCommentMonitor');
const { collections } = require('../config/collections');

/**
 * /testnexusmonitor command
 * Allows manual testing of the Nexus Mods comment monitor for a specific collection or all
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('testnexusmonitor')
    .setDescription('Manually test Nexus Mods comment monitoring (admin only)')
    .addStringOption(option =>
      option
        .setName('collection')
        .setDescription('Collection slug or "all"')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const collectionInput = interaction.options.getString('collection') || 'all';
    const monitor = new NexusCommentMonitor();
    monitor.initialize(interaction.client);

    await interaction.deferReply();

    try {
      logger.info(`[TEST_NEXUS_MONITOR] Manual test triggered by ${interaction.user.username} for collection: ${collectionInput}`);

      // Determine which collections to test
      let collectionsToTest;
      if (collectionInput.toLowerCase() === 'all') {
        collectionsToTest = collections;
      } else {
        const found = collections.find(c => c.slug === collectionInput);
        if (!found) {
          await interaction.editReply({ content: `Collection not found: ${collectionInput}` });
          return;
        }
        collectionsToTest = [found];
      }

      let totalAlerts = 0;
      for (const collection of collectionsToTest) {
        logger.info(`[TEST_NEXUS_MONITOR] Testing collection: ${collection.display}`);
        await interaction.editReply({ content: `Testing collection: ${collection.display}` });

        try {
          const mods = await monitor.getModsFromCollection(collection.slug);
          logger.info(`[NEXUS_MONITOR] Processing ${mods.length} mods for comments`);

          for (const mod of mods) {
            try {
              // Scrape comments, and check for session expiry or 403
              const comments = await monitor.scrapeModComments(mod);
              logger.info(`[NEXUS_MONITOR] Scraped ${comments.length} comments for mod: ${mod.name}`);
            } catch (error) {
              // Detect expired session cookie
              if (
                error.response &&
                (error.response.status === 401 || error.response.status === 403)
              ) {
                const body = error.response.data || "";
                if (
                  typeof body === "string" &&
                  (body.toLowerCase().includes("age verification") ||
                   body.toLowerCase().includes("login") ||
                   body.toLowerCase().includes("verify your age"))
                ) {
                  logger.error(`[TEST_NEXUS_MONITOR] Nexus session cookie expired or invalid. Please update your NEXUS_SESSION_COOKIE in your .env file.`);
                  await interaction.editReply({
                    content: '❌ **Nexus session cookie expired or invalid.**\nPlease update your `NEXUS_SESSION_COOKIE` in your `.env` file (log in, verify age, copy new cookie).'
                  });
                  throw new Error("Nexus session cookie expired or invalid.");
                }
              }
              // Fallback: report error for this mod
              logger.error(`[NEXUS_MONITOR] Failed to process comments for mod ${mod.name}: ${error.message}`);
            }
          }
        } catch (error) {
          logger.error(`[TEST_NEXUS_MONITOR] Error processing collection ${collection.display}: ${error.message}`);
        }
      }

      await interaction.editReply({ content: `Test complete for collection(s): ${collectionsToTest.map(c => c.display).join(', ')}` });

    } catch (error) {
      logger.error(`[TEST_NEXUS_MONITOR] Test failed: ${error.message}`);
      await interaction.editReply({ content: `❌ Test failed: ${error.message}` });
    }
  }
};
