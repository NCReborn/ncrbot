const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const guildConfigManager = require('../config/guildConfigManager');
const GameVersionManager = require('../utils/GameVersionManager');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog-config')
    .setDescription('Configure changelog settings for this guild (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

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

    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Show collections and groups configured for this guild')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const config = guildConfigManager.loadGuildConfig(guildId);
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'add-collection') {
        const slug = interaction.options.getString('slug');
        const display = interaction.options.getString('display');
        const group = interaction.options.getString('group');
        const priority = interaction.options.getInteger('priority');

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

        if (!groupConfig.members.includes(slug)) {
          groupConfig.members.push(slug);
        }

        config.collections.push({
          slug,
          display,
          group,
          priority
        });

        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`✅ Added collection **${display}** (${slug}) to group **${group}**`);
      }

      if (sub === 'remove-collection') {
        const slug = interaction.options.getString('slug');

        config.collections = config.collections.filter(c => c.slug !== slug);
        for (const group of config.groups) {
          group.members = group.members.filter(s => s !== slug);
        }

        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`🗑️ Removed collection slug **${slug}**`);
      }

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

      if (sub === 'set-game-version') {
        const slug = interaction.options.getString('slug');
        const version = interaction.options.getString('version');

        GameVersionManager.setVersion(guildId, slug, version);

        return interaction.editReply(`🛠️ Game version for **${slug}** set to **${version}**`);
      }

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

      if (sub === 'set-combine-window') {
        const ms = interaction.options.getInteger('milliseconds');

        config.combineWindowMs = ms;
        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`⏱️ Combine window set to **${ms}ms**`);
      }

      if (sub === 'list') {
        const embed = new EmbedBuilder()
          .setTitle('Changelog configuration for this guild')
          .setColor(0x00AEFF);

        if (config.collections.length === 0) {
          embed.addFields({
            name: 'Collections',
            value: 'No collections configured.',
            inline: false
          });
        } else {
          const collectionsText = config.collections
            .sort((a, b) => a.priority - b.priority)
            .map(c =>
              `• **${c.display}**\n` +
              `  Slug: \`${c.slug}\`\n` +
              `  Group: \`${c.group}\`\n` +
              `  Priority: **${c.priority}**`
            )
            .join('\n\n');

          embed.addFields({
            name: 'Collections',
            value: collectionsText,
            inline: false
          });
        }

        if (config.groups.length === 0) {
          embed.addFields({
            name: 'Groups',
            value: 'No groups configured.',
            inline: false
          });
        } else {
          const groupsText = config.groups
            .map(g =>
              `• **${g.name}**\n` +
              `  Display: \`${g.displayName || g.name}\`\n` +
              `  Channel: ${g.channelId ? `<#${g.channelId}>` : '`Not set`'}\n` +
              `  Template: \`${g.template || 'ncr'}\`\n` +
              `  Game Version: \`${g.gameVersion || '1.0'}\`\n` +
              `  Combined: **${g.combined ? 'Yes' : 'No'}**\n` +
              `  Members: ${
                Array.isArray(g.members) && g.members.length
                  ? g.members.map(m => `\`${m}\``).join(', ')
                  : '`None`'
              }`
            )
            .join('\n\n');

          embed.addFields({
            name: 'Groups',
            value: groupsText,
            inline: false
          });
        }

        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      logger.error(`[CHANGELOG_CONFIG] Error: ${err.message}`, err);
      return interaction.editReply(`❌ Error: ${err.message}`);
    }
  }
};
