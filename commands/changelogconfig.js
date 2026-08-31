const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const guildConfigManager = require('../config/guildConfigManager');
const GameVersionManager = require('../utils/GameVersionManager');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog-config')
    .setDescription('Configure changelog settings for this guild (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // Add collection
    .addSubcommand(sub =>
      sub
        .setName('add-collection')
        .setDescription('Add a collection slug to track in this guild')
        .addStringOption(opt =>
          opt.setName('slug')
            .setDescription('Collection slug (e.g., rcuccp)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('display')
            .setDescription('Display name (e.g., NCR Core)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('group')
            .setDescription('Group name (e.g., NCR)')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('priority')
            .setDescription('Priority ordering (lower = earlier)')
            .setRequired(true)
        )
    )

    // Remove collection
    .addSubcommand(sub =>
      sub
        .setName('remove-collection')
        .setDescription('Remove a tracked collection slug from this guild')
        .addStringOption(opt =>
          opt.setName('slug')
            .setDescription('Collection slug to remove')
            .setRequired(true)
        )
    )

    // Set channel
    .addSubcommand(sub =>
      sub
        .setName('set-channel')
        .setDescription('Set the changelog channel for a group')
        .addStringOption(opt =>
          opt.setName('group')
            .setDescription('Group name')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to post changelogs')
            .setRequired(true)
        )
    )

    // Set template
    .addSubcommand(sub =>
      sub
        .setName('set-template')
        .setDescription('Set the template used for a group')
        .addStringOption(opt =>
          opt.setName('group')
            .setDescription('Group name')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('template')
            .setDescription('Template name (ncr, e33, sub2)')
            .setRequired(true)
        )
    )

    // Set game version
    .addSubcommand(sub =>
      sub
        .setName('set-game-version')
        .setDescription('Set the game version for a collection slug')
        .addStringOption(opt =>
          opt.setName('slug')
            .setDescription('Collection slug')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('version')
            .setDescription('Game version (e.g., 2.3)')
            .setRequired(true)
        )
    )

    // Set priority
    .addSubcommand(sub =>
      sub
        .setName('set-priority')
        .setDescription('Set the priority for a collection slug')
        .addStringOption(opt =>
          opt.setName('slug')
            .setDescription('Collection slug')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('priority')
            .setDescription('New priority value')
            .setRequired(true)
        )
    )

    // Set combine window
    .addSubcommand(sub =>
      sub
        .setName('set-combine-window')
        .setDescription('Set the combine window (ms) for grouped changelogs')
        .addIntegerOption(opt =>
          opt.setName('milliseconds')
            .setDescription('Combine window in milliseconds')
            .setRequired(true)
        )
    )

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const config = guildConfigManager.loadGuildConfig(guildId);

    const sub = interaction.options.getSubcommand();

    try {
      // ADD COLLECTION
      if (sub === 'add-collection') {
        const slug = interaction.options.getString('slug');
        const display = interaction.options.getString('display');
        const group = interaction.options.getString('group');
        const priority = interaction.options.getInteger('priority');

        // Ensure group exists
        let groupConfig = config.groups.find(g => g.name === group);
        if (!groupConfig) {
          groupConfig = {
            name: group,
            displayName: group,
            channelId: null,
            members: [],
            template: 'ncr',
            gameVersion: '1.0',
            combined: false
          };
          config.groups.push(groupConfig);
        }

        // Add slug to group
        if (!groupConfig.members.includes(slug)) {
          groupConfig.members.push(slug);
        }

        // Add collection entry
        config.collections.push({
          slug,
          display,
          group,
          priority
        });

        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`✅ Added collection **${display}** (${slug}) to group **${group}**`);
      }

      // REMOVE COLLECTION
      if (sub === 'remove-collection') {
        const slug = interaction.options.getString('slug');

        config.collections = config.collections.filter(c => c.slug !== slug);

        for (const group of config.groups) {
          group.members = group.members.filter(s => s !== slug);
        }

        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`🗑️ Removed collection slug **${slug}**`);
      }

      // SET CHANNEL
      if (sub === 'set-channel') {
        const group = interaction.options.getString('group');
        const channel = interaction.options.getChannel('channel');

        const groupConfig = config.groups.find(g => g.name === group);
        if (!groupConfig) {
          return interaction.editReply(`❌ Group **${group}** not found`);
        }

        groupConfig.channelId = channel.id;
        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`📢 Set changelog channel for **${group}** to <#${channel.id}>`);
      }

      // SET TEMPLATE
      if (sub === 'set-template') {
        const group = interaction.options.getString('group');
        const template = interaction.options.getString('template');

        const groupConfig = config.groups.find(g => g.name === group);
        if (!groupConfig) {
          return interaction.editReply(`❌ Group **${group}** not found`);
        }

        groupConfig.template = template;
        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`🎨 Template for **${group}** set to **${template}**`);
      }

      // SET GAME VERSION
      if (sub === 'set-game-version') {
        const slug = interaction.options.getString('slug');
        const version = interaction.options.getString('version');

        GameVersionManager.setVersion(guildId, slug, version);

        return interaction.editReply(`🛠️ Game version for **${slug}** set to **${version}**`);
      }

      // SET PRIORITY
      if (sub === 'set-priority') {
        const slug = interaction.options.getString('slug');
        const priority = interaction.options.getInteger('priority');

        const collection = config.collections.find(c => c.slug === slug);
        if (!collection) {
          return interaction.editReply(`❌ Collection slug **${slug}** not found`);
        }

        collection.priority = priority;
        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`📌 Priority for **${slug}** set to **${priority}**`);
      }

      // SET COMBINE WINDOW
      if (sub === 'set-combine-window') {
        const ms = interaction.options.getInteger('milliseconds');

        config.combineWindowMs = ms;
        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`⏱️ Combine window set to **${ms}ms**`);
      }

    } catch (err) {
      logger.error(`[CHANGELOG_CONFIG] Error: ${err.message}`, err);
      return interaction.editReply(`❌ Error: ${err.message}`);
    }
  }
};
