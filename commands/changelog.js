const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchRevision, processModFiles, computeDiff } = require('../utils/nexusApi');
const collectionsConfig = require('../config/collections');
const changelogGenerator = require('../services/changelog/ChangelogGenerator');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Manually post a changelog for a collection (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('collection')
        .setDescription('Which collection to post changelog for')
        .setRequired(true)
        .addChoices(
          { name: 'NCR Core', value: 'rcuccp' },
          { name: 'NCR Extras', value: 'srpv39' },
          { name: 'NCR Body', value: 'vfy7w1' },
          { name: 'Subnautica 2 Reborn', value: '9htmlb' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('previous_revision')
        .setDescription('Previous revision number (leave empty for initial changelog)')
        .setRequired(false)
        .setMinValue(1)
    )
    .addIntegerOption(option =>
      option
        .setName('current_revision')
        .setDescription('Current revision number')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const slug = interaction.options.getString('collection');
      const prevRev = interaction.options.getInteger('previous_revision');
      const currentRev = interaction.options.getInteger('current_revision');

      const collection = collectionsConfig.getCollection(slug);
      if (!collection) {
        return interaction.editReply({
          content: `❌ Collection ${slug} not found in configuration.`
        });
      }

      const groupConfig = collectionsConfig.getGroupForCollection(slug);
      if (!groupConfig) {
        return interaction.editReply({
          content: `❌ Group configuration not found for ${collection.display}.`
        });
      }

      // Handle initial changelog (no previous revision)
      if (prevRev === null) {
        logger.info(`[CHANGELOG] Posting initial changelog for ${collection.display} (Revision ${currentRev})`);

        const revisionData = await fetchRevision(currentRev, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION);
        const mods = processModFiles(revisionData.modFiles);

        // Create initial diff with all mods as "added"
        const diffs = {
          added: mods,
          updated: [],
          removed: []
        };

        // Build revision data
        const changelogData = {
          collections: [{
            slug: slug,
            display: collection.display,
            oldRev: 0,
            newRev: currentRev
          }],
          diffs: diffs
        };

        // Send changelog
        await changelogGenerator.sendChangelog(interaction.client, groupConfig, changelogData);

        logger.info(`[CHANGELOG] Successfully posted initial changelog for ${collection.display} (Revision ${currentRev})`);
        return interaction.editReply({
          content: `✅ Initial changelog posted for **${collection.display}** (Revision ${currentRev})`
        });
      }

      // Handle regular changelog with comparison
      logger.info(`[CHANGELOG] Fetching revisions for ${collection.display} (${prevRev} → ${currentRev})`);

      // Fetch both revisions
      const [oldRevisionData, newRevisionData] = await Promise.all([
        fetchRevision(slug, prevRev, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION),
        fetchRevision(slug, currentRev, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION)
      ]);

      const oldMods = processModFiles(oldRevisionData.modFiles);
      const newMods = processModFiles(newRevisionData.modFiles);
      const diffs = computeDiff(oldMods, newMods);

      // Build revision data
      const revisionData = {
        collections: [{
          slug: slug,
          display: collection.display,
          oldRev: prevRev,
          newRev: currentRev
        }],
        diffs: diffs
      };

      // Send changelog
      await changelogGenerator.sendChangelog(interaction.client, groupConfig, revisionData);

      logger.info(`[CHANGELOG] Successfully posted changelog for ${collection.display} ${prevRev} → ${currentRev}`);
      return interaction.editReply({
        content: `✅ Changelog posted for **${collection.display}** (${prevRev} → ${currentRev})`
      });
    } catch (error) {
      logger.error(`[CHANGELOG] Error: ${error.message}`, error);
      return interaction.editReply({
        content: `❌ Failed to generate changelog: ${error.message}`
      });
    }
  }
};
