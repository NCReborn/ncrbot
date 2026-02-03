const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const {
  fetchRevision, getCollectionSlug, getCollectionName,
  computeDiff, findExclusiveChanges, processModFiles
} = require('../utils/nexusApi');
const changelogGenerator = require('../services/changelog/ChangelogGenerator');
const collectionsConfig = require('../config/collections');
const logger = require('../utils/logger');
const { checkAndSetRateLimit } = require('../utils/rateLimiter');
const { errorEmbed } = require('../utils/discordUtils');
const CONSTANTS = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diff')
    .setDescription('Show mod differences between collection revisions (Admin only)')
    .addStringOption(option =>
      option.setName('collection1').setDescription('First collection name (e.g. NCR, ADR)').setRequired(true))
    .addIntegerOption(option =>
      option.setName('oldrev1').setDescription('Old revision number for collection 1').setRequired(true))
    .addIntegerOption(option =>
      option.setName('newrev1').setDescription('New revision number for collection 1').setRequired(true))
    .addStringOption(option =>
      option.setName('collection2').setDescription('Second collection name (optional)').setRequired(false))
    .addIntegerOption(option =>
      option.setName('oldrev2').setDescription('Old revision number for collection 2 (optional)').setRequired(false))
    .addIntegerOption(option =>
      option.setName('newrev2').setDescription('New revision number for collection 2 (optional)').setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = `${interaction.user.tag} (${interaction.user.id})`;

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      logger.warn(`[DIFF] Permission denied for ${username} in guild ${interaction.guildId}`);
      await interaction.editReply({ embeds: [errorEmbed('Permission Denied', 'This command is only available to administrators.')] });
      return;
    }

    // Global rate limit
    const globalKey = 'diff:global';
    const globalLeft = checkAndSetRateLimit(globalKey, CONSTANTS.COOLDOWNS.GLOBAL_COMMAND);
    if (globalLeft > 0) {
      logger.info(`[DIFF] Global cooldown hit by ${username} (${globalLeft}s left)`);
      await interaction.editReply({ embeds: [errorEmbed('Global Cooldown', `⏳ Please wait ${globalLeft} more second(s) before anyone can use this command again.`)] });
      return;
    }

    // Per-user rate limit with consistent key: diff:user:<userId>
    const userKey = `diff:user:${interaction.user.id}`;
    const userLeft = checkAndSetRateLimit(userKey, CONSTANTS.COOLDOWNS.USER_COMMAND);
    if (userLeft > 0) {
      logger.info(`[DIFF] User cooldown hit by ${username} (${userLeft}s left)`);
      await interaction.editReply({ embeds: [errorEmbed('User Cooldown', `⏳ You must wait ${userLeft} more minute(s) before you can use this command again.`)] });
      return;
    }

    const c1 = interaction.options.getString('collection1');
    const old1 = interaction.options.getInteger('oldrev1');
    const new1 = interaction.options.getInteger('newrev1');
    const c2 = interaction.options.getString('collection2');
    const old2 = interaction.options.getInteger('oldrev2');
    const new2 = interaction.options.getInteger('newrev2');

    try {
      if (!c2 || old2 === null || new2 === null) {
        const slug = getCollectionSlug(c1);
        const collectionName = getCollectionName(slug);

        const [oldData, newData] = await Promise.all([
          fetchRevision(slug, old1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION),
          fetchRevision(slug, new1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION)
        ]);

        const oldMods = processModFiles(oldData.modFiles);
        const newMods = processModFiles(newData.modFiles);
        const diffs = computeDiff(oldMods, newMods);

        // Get group configuration for this collection
        const groupConfig = collectionsConfig.getGroupForCollection(slug);
        
        if (groupConfig) {
          // Use new changelog generator
          const revisionData = {
            collections: [{
              slug: slug,
              display: collectionName,
              oldRev: old1,
              newRev: new1
            }],
            diffs: diffs
          };
          
          // Send to current channel instead of configured channel
          const originalChannelId = groupConfig.channelId;
          groupConfig.channelId = interaction.channelId;
          
          await changelogGenerator.sendChangelog(interaction.client, groupConfig, revisionData);
          
          // Restore original channel ID
          groupConfig.channelId = originalChannelId;
        }

        await interaction.editReply({ content: `Changelog for ${collectionName} ${old1} → ${new1}:` });
        logger.info(`[DIFF] Changelog for ${collectionName} ${old1}→${new1} generated by ${username} in guild ${interaction.guildId}`);
      } else {
        // Combined changelog not yet supported in new system - use legacy approach
        logger.warn(`[DIFF] Combined changelog requested but not yet implemented in new system`);
        await interaction.editReply({ embeds: [errorEmbed('Not Yet Implemented', 'Combined changelog generation is not yet supported. Please use single collection diffs.')] });
      }
    } catch (err) {
      logger.error(`[DIFF] Error for ${username} in guild ${interaction.guildId}: ${err.stack || err}`);
      await interaction.editReply({ embeds: [errorEmbed('Error Generating Changelog', err.message)] });
    }
  }
};
