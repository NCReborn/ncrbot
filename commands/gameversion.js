const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const collectionsConfig = require('../config/collections');
const GameVersionManager = require('../utils/GameVersionManager');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gameversion')
    .setDescription('Update the game version for a collection (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('collection')
        .setDescription('Which collection to update')
        .setRequired(true)
        .addChoices(
          { name: 'NCR Core', value: 'rcuccp' },
          { name: 'NCR Extras', value: 'srpv39' },
          { name: 'NCR Body', value: 'vfy7w1' },
          { name: 'Subnautica 2 Reborn', value: '9htmlb' }
        )
    )
    .addStringOption(option =>
      option
        .setName('version')
        .setDescription('The new game version (e.g., "2.3", "EA 1 HotFix 2")')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const slug = interaction.options.getString('collection');
      const newVersion = interaction.options.getString('version').trim();

      const collection = collectionsConfig.getCollection(slug);
      if (!collection) {
        return interaction.editReply({
          content: `❌ Collection ${slug} not found in configuration.`
        });
      }

      if (!newVersion || newVersion.length === 0) {
        return interaction.editReply({
          content: `❌ Version cannot be empty.`
        });
      }

      // Update the game version
      GameVersionManager.setVersion(slug, newVersion);

      logger.info(`[GAMEVERSION] ${interaction.user.tag} updated ${collection.display} to version ${newVersion}`);

      return interaction.editReply({
        content: `✅ Updated **${collection.display}** game version to **${newVersion}**\n\nThis version will be used in the next changelog post.`
      });
    } catch (error) {
      logger.error(`[GAMEVERSION] Error: ${error.message}`, error);
      return interaction.editReply({
        content: `❌ Failed to update game version: ${error.message}`
      });
    }
  }
};
