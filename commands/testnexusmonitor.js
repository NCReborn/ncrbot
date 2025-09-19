const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const logger = require('../utils/logger');
const { checkAndSetRateLimit } = require('../utils/rateLimiter');
const { errorEmbed } = require('../utils/discordUtils');
const NexusCommentMonitor = require('../services/nexusCommentMonitor');

const USER_COOLDOWN = 60 * 1000;   // 1 minute
const GLOBAL_COOLDOWN = 60 * 1000; // 1 minute

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testnexusmonitor')
    .setDescription('Test Nexus Mods comment monitoring (Admin only)')
    .addStringOption(option =>
      option.setName('collection')
        .setDescription('Collection slug to test (optional, defaults to all collections)')
        .setRequired(false)),

  async execute(interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }

    const username = interaction.user.username;
    const userId = interaction.user.id;

    // Rate limiting
    const limitResult = checkAndSetRateLimit('testnexusmonitor', userId, USER_COOLDOWN, GLOBAL_COOLDOWN);
    if (limitResult.limited) {
      const timeLeft = Math.ceil(limitResult.timeLeft / 1000);
      return interaction.reply({ content: `You are being rate limited. Please wait ${timeLeft} seconds.`, ephemeral: true });
    }

    const collectionSlug = interaction.options.getString('collection');

    try {
      await interaction.deferReply();

      logger.info(`[TEST_NEXUS_MONITOR] Manual test triggered by ${username} for collection: ${collectionSlug || 'all'}`);

      const commentMonitor = new NexusCommentMonitor();
      commentMonitor.initialize(interaction.client);

      if (collectionSlug) {
        // Test specific collection
        logger.info(`[TEST_NEXUS_MONITOR] Testing collection: ${collectionSlug}`);
        
        // Create a minimal collection object for testing
        const testCollection = { slug: collectionSlug, display: collectionSlug };
        
        try {
          const mods = await commentMonitor.getModsFromCollection(collectionSlug);
          
          if (mods.length === 0) {
            await interaction.editReply(`❌ No mods found in collection: ${collectionSlug}`);
            return;
          }

          await interaction.editReply(`🔍 Testing comment monitoring for collection: ${collectionSlug} (${mods.length} mods)\nThis may take a few minutes...`);

          // Test first few mods to avoid hitting rate limits
          const testMods = mods.slice(0, 3);
          const alerts = await commentMonitor.processModsForComments(testMods, testCollection.display);

          if (alerts.length > 0) {
            // Send test alerts to current channel instead of configured alert channel
            await commentMonitor.sendDiscordAlerts(alerts, interaction.channelId);

            await interaction.followUp(`✅ Test completed! Found ${alerts.length} flagged comments from ${testMods.length} tested mods.`);
          } else {
            await interaction.followUp(`✅ Test completed! No flagged comments found in ${testMods.length} tested mods.`);
          }

        } catch (error) {
          logger.error(`[TEST_NEXUS_MONITOR] Error testing collection ${collectionSlug}: ${error.message}`);
          await interaction.editReply(`❌ Error testing collection: ${error.message}`);
        }

      } else {
        // Test all collections (limited to avoid rate limits)
        await interaction.editReply('🔍 Testing comment monitoring for all collections...\nThis may take several minutes...');

        try {
          const startTime = Date.now();
          
          const modCollections = await commentMonitor.getModCollections();
          const testCollections = modCollections.slice(0, 2); // Limit to first 2 collections for testing

          let totalAlerts = 0;
          for (const collection of testCollections) {
            logger.info(`[TEST_NEXUS_MONITOR] Testing collection: ${collection.display}`);
            
            const mods = await commentMonitor.getModsFromCollection(collection.slug);
            const testMods = mods.slice(0, 2); // Test only first 2 mods per collection
            
            const collectionAlerts = await commentMonitor.processModsForComments(testMods, collection.display);
            
            if (collectionAlerts.length > 0) {
              await commentMonitor.sendDiscordAlerts(collectionAlerts, interaction.channelId);
              totalAlerts += collectionAlerts.length;
            }
          }

          const duration = Math.round((Date.now() - startTime) / 1000);
          await interaction.followUp(`✅ Test completed in ${duration}s! Tested ${testCollections.length} collections. Found ${totalAlerts} flagged comments.`);

        } catch (error) {
          logger.error(`[TEST_NEXUS_MONITOR] Error during full test: ${error.message}`);
          await interaction.editReply(`❌ Error during test: ${error.message}`);
        }
      }

    } catch (error) {
      logger.error(`[TEST_NEXUS_MONITOR] Command failed: ${error.message}`);
      
      const embed = errorEmbed(
        'Test Nexus Monitor Error',
        `Failed to test Nexus comment monitoring: ${error.message}`,
        interaction.user
      );

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }
};