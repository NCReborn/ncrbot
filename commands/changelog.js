// commands/changelog.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchRevision, processModFiles, computeDiff } = require('../utils/nexusApi');
const guildConfigManager = require('../config/guildConfigManager');
const revisionState = require('../utils/revisionState');
const GameVersionManager = require('../utils/GameVersionManager');
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
        .setDescription('Select a collection to post changelog for')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('current_revision')
        .setDescription('Current revision number')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(option =>
      option
        .setName('previous_revision')
        .setDescription('Previous revision number (leave empty for initial changelog)')
        .setRequired(false)
        .setMinValue(1)
    ),

  async autocomplete(interaction) {
    // Safety: autocomplete can fire in DMs, threads, uncached guilds
    if (!interaction.guild) {
      console.log("[DEBUG] Autocomplete: No guild context available");
      return interaction.respond([
        { name: "No guild context", value: "none" }
      ]);
    }

    const guildId = interaction.guild.id;

    // Always load fresh config
    const config = guildConfigManager.loadGuildConfig(guildId);

    // Safety: ensure collections exists
    if (!config || !Array.isArray(config.collections)) {
      console.log(`[DEBUG] Autocomplete: No collections array for guild ${guildId}`);
      return interaction.respond([
        { name: "No collections configured", value: "none" }
      ]);
    }

    // Safety: ensure at least one collection exists
    if (config.collections.length === 0) {
      console.log(`[DEBUG] Autocomplete: Collections empty for guild ${guildId}`);
      return interaction.respond([
        { name: "No collections configured", value: "none" }
      ]);
    }

    // Build choices
    const choices = config.collections.map(c => ({
      name: `${c.display} (${c.slug})`,
      value: c.slug
    }));

    console.log(`[DEBUG] Autocomplete: Returning ${choices.length} choices for guild ${guildId}`);

    // Respond safely
    try {
      await interaction.respond(choices.slice(0, 25));
    } catch (err) {
      console.log(`[DEBUG] Autocomplete error: ${err.message}`);
      return interaction.respond([
        { name: "Error loading collections", value: "none" }
      ]);
    }
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const guildId = interaction.guild.id;
      const slug = interaction.options.getString('collection');
      const currentRev = interaction.options.getInteger('current_revision');
      const prevRev = interaction.options.getInteger('previous_revision');

      const guildConfig = guildConfigManager.loadGuildConfig(guildId);

      const collection = guildConfig.collections.find(c => c.slug === slug);
      if (!collection) {
        return interaction.editReply({
          content: `❌ This guild is not configured to track collection slug **${slug}**.`
        });
      }

      const groupConfig = guildConfig.groups.find(g => g.name === collection.group);
      if (!groupConfig) {
        return interaction.editReply({
          content: `❌ Group configuration not found for **${collection.display}**.`
        });
      }

      // Initial changelog
      if (!prevRev) {
        logger.info(`[CHANGELOG] Posting initial changelog for ${collection.display} (Rev ${currentRev})`);

        const revisionData = await fetchRevision(
          slug,
          currentRev,
          process.env.NEXUS_API_KEY,
          process.env.APP_NAME,
          process.env.APP_VERSION
        );

        const mods = processModFiles(revisionData.modFiles);

        const diffs = {
          added: mods,
          updated: [],
          removed: []
        };

        const changelogData = {
          collections: [{
            slug,
            display: collection.display,
            oldRev: 0,
            newRev: currentRev
          }],
          diffs
        };

        await changelogGenerator.sendChangelog(
          interaction.client,
          guildId,
          groupConfig,
          changelogData
        );

        revisionState.setLastPostedRevision(guildId, slug, currentRev, logger);

        return interaction.editReply({
          content: `✅ Initial changelog posted for **${collection.display}** (Revision ${currentRev})`
        });
      }

      // Regular changelog
      logger.info(`[CHANGELOG] Fetching revisions for ${collection.display} (${prevRev} → ${currentRev})`);

      const [oldRevisionData, newRevisionData] = await Promise.all([
        fetchRevision(slug, prevRev, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION),
        fetchRevision(slug, currentRev, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION)
      ]);

      const oldMods = processModFiles(oldRevisionData.modFiles);
      const newMods = processModFiles(newRevisionData.modFiles);
      const diffs = computeDiff(oldMods, newMods);

      const revisionData = {
        collections: [{
          slug,
          display: collection.display,
          oldRev: prevRev,
          newRev: currentRev
        }],
        diffs
      };

      await changelogGenerator.sendChangelog(
        interaction.client,
        guildId,
        groupConfig,
        revisionData
      );

      revisionState.setLastPostedRevision(guildId, slug, currentRev, logger);

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
