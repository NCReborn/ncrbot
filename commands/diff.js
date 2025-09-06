const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { fetchRevision, getCollectionSlug, getCollectionName, computeDiff, findExclusiveChanges, processModFiles } = require('../utils/nexusApi');
const { sendCombinedChangelogMessages, sendSingleChangelogMessages } = require('../services/changelogService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diff')
    .setDescription('Show mod differences between collection revisions')
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
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'This command is only available to administrators.', ephemeral: true });
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
        // Single collection
        const slug = getCollectionSlug(c1);
        const collectionName = getCollectionName(slug);

        const [oldData, newData] = await Promise.all([
          fetchRevision(slug, old1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION),
          fetchRevision(slug, new1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION)
        ]);

        const oldMods = processModFiles(oldData.modFiles);
        const newMods = processModFiles(newData.modFiles);

        const diffs = computeDiff(oldMods, newMods);

        await sendSingleChangelogMessages(interaction.channel, diffs, slug, old1, new1, collectionName);
        await interaction.reply({ content: `Changelog for ${collectionName} ${old1} → ${new1}:`, ephemeral: true });
      } else {
        // Dual collection
        const slug1 = getCollectionSlug(c1);
        const slug2 = getCollectionSlug(c2);

        const [oldData1, newData1, oldData2, newData2] = await Promise.all([
          fetchRevision(slug1, old1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION),
          fetchRevision(slug1, new1, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION),
          fetchRevision(slug2, old2, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION),
          fetchRevision(slug2, new2, process.env.NEXUS_API_KEY, process.env.APP_NAME, process.env.APP_VERSION)
        ]);

        const oldMods1 = processModFiles(oldData1.modFiles);
        const newMods1 = processModFiles(newData1.modFiles);
        const oldMods2 = processModFiles(oldData2.modFiles);
        const newMods2 = processModFiles(newData2.modFiles);

        const diffs1 = computeDiff(oldMods1, newMods1);
        const diffs2 = computeDiff(oldMods2, newMods2);
        const exclusiveChanges = findExclusiveChanges(diffs1, diffs2);

        await sendCombinedChangelogMessages(interaction.channel, diffs1, diffs2, exclusiveChanges, slug1, old1, new1, slug2, old2, new2);
        await interaction.reply({ content: `Combined changelog for ${c1} and ${c2}:`, ephemeral: true });
      }
    } catch (err) {
      console.error('Error:', err);
      await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }
};
