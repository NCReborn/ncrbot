const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const guildConfigManager = require('../../config/guildConfigManager');
const GameVersionManager = require('../../utils/GameVersionManager');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog-config')
    .setDescription('Configure changelog settings for this guild (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // One-shot setup for the common case: track a collection and post its
    // changelogs in whatever channel this command is run in. Running `add`
    // again for a slug that's already tracked updates it in place (channel,
    // template, display, priority) instead of creating a duplicate entry.
    //
    // `group` only needs to be set when you want two or more collections'
    // updates batched into a single combined Discord post (e.g. several
    // sub-collections that tend to update together) -- leave it unset and
    // each collection gets its own private group (posted individually, not
    // combined with anything). `priority` only has any effect inside a
    // combined group, where it orders collections within one batched post.
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Track a collection and post its changelogs in this channel')
        .addStringOption(opt =>
          opt.setName('slug')
            .setDescription('Collection slug (e.g., rcuccp)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('template')
            .setDescription('Embed template to use')
            .setRequired(true)
            .addChoices(
              { name: 'NCR', value: 'ncr' },
              { name: 'Expedition 33', value: 'e33' },
              { name: 'Subnautica 2', value: 'sub2' },
              { name: 'CPE', value: 'cpe' }
            )
        )
        .addStringOption(opt =>
          opt.setName('display')
            .setDescription('Display name shown in changelogs (defaults to the slug)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('version')
            .setDescription('Game version (e.g., 2.3) -- defaults to 1.0')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('group')
            .setDescription('Only set this to batch multiple collections into one combined post')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('priority')
            .setDescription('Ordering within a combined group (lower = earlier). Ignored otherwise.')
            .setRequired(false)
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

    // Deletes a group's own settings (channel/template/combine state).
    // Refuses if collections still belong to it -- remove/reassign those
    // first, or pass force:true to remove them along with the group.
    .addSubcommand(sub =>
      sub
        .setName('remove-group')
        .setDescription('Remove a group (refuses if collections still belong to it)')
        .addStringOption(opt =>
          opt.setName('group')
            .setDescription('Group name to remove')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName('force')
            .setDescription('Also remove any collections still assigned to this group')
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('set-channel')
        .setDescription('Move a group\'s changelog channel without re-running add')
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
        .setName('set-priority')
        .setDescription('Set the priority for a collection slug (only matters in a combined group)')
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guild.id;
    const config = guildConfigManager.loadGuildConfig(guildId);
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'add') {
        const slug = interaction.options.getString('slug');
        const template = interaction.options.getString('template');
        const display = interaction.options.getString('display') || slug;
        const version = interaction.options.getString('version') || '1.0';
        const explicitGroup = interaction.options.getString('group');
        const priority = interaction.options.getInteger('priority') ?? 0;

        // No group given -> this collection gets its own private group
        // (never combined with anything else). A named group is only for
        // deliberately batching multiple collections into one post.
        const groupName = explicitGroup || slug;

        let groupConfig = config.groups.find(g => g.name === groupName);
        if (!groupConfig) {
          groupConfig = {
            name: groupName,
            displayName: groupName,
            channelId: interaction.channelId,
            members: [],
            template,
            combined: Boolean(explicitGroup)
          };
          config.groups.push(groupConfig);
        } else {
          groupConfig.channelId = interaction.channelId;
          groupConfig.template = template;
          if (explicitGroup) {
            groupConfig.combined = true;
          }
        }

        if (!groupConfig.members.includes(slug)) {
          groupConfig.members.push(slug);
        }

        // Upsert -- re-running `add` for a slug that's already tracked
        // updates it in place instead of creating a duplicate entry.
        const existing = config.collections.find(c => c.slug === slug);
        if (existing) {
          existing.display = display;
          existing.group = groupName;
          existing.priority = priority;
        } else {
          config.collections.push({ slug, display, group: groupName, priority });
        }

        GameVersionManager.setVersion(guildId, slug, version);
        guildConfigManager.saveGuildConfig(guildId, config);

        const combinedNote = groupConfig.combined
          ? ` (combined with group **${groupName}**)`
          : '';
        return interaction.editReply(
          `✅ ${existing ? 'Updated' : 'Added'} **${display}** (\`${slug}\`) -- posting to <#${interaction.channelId}> ` +
          `using the **${template}** template, game version \`${version}\`${combinedNote}.`
        );
      }

      if (sub === 'remove-collection') {
        const slug = interaction.options.getString('slug');

        const existed = config.collections.some(c => c.slug === slug);
        if (!existed) {
          return interaction.editReply(`❌ No collection with slug **${slug}** is tracked in this guild.`);
        }

        config.collections = config.collections.filter(c => c.slug !== slug);
        for (const group of config.groups) {
          group.members = group.members.filter(s => s !== slug);
        }

        guildConfigManager.saveGuildConfig(guildId, config);

        return interaction.editReply(`🗑️ Removed collection slug **${slug}**`);
      }

      if (sub === 'remove-group') {
        const groupName = interaction.options.getString('group');
        const force = interaction.options.getBoolean('force') || false;

        const groupConfig = config.groups.find(g => g.name === groupName);
        if (!groupConfig) {
          return interaction.editReply(`❌ Group **${groupName}** not found`);
        }

        const attachedSlugs = config.collections
          .filter(c => c.group === groupName)
          .map(c => c.slug);

        if (attachedSlugs.length > 0 && !force) {
          return interaction.editReply(
            `❌ Group **${groupName}** still has ${attachedSlugs.length} collection(s) assigned ` +
            `(\`${attachedSlugs.join('`, `')}\`). Remove them first, or re-run with \`force:true\` ` +
            `to delete the group and those collections together.`
          );
        }

        if (force && attachedSlugs.length > 0) {
          config.collections = config.collections.filter(c => c.group !== groupName);
        }

        config.groups = config.groups.filter(g => g.name !== groupName);
        guildConfigManager.saveGuildConfig(guildId, config);

        const cascadeNote = attachedSlugs.length > 0
          ? ` and its ${attachedSlugs.length} collection(s)`
          : '';
        return interaction.editReply(`🗑️ Removed group **${groupName}**${cascadeNote}`);
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
            .map(c => {
              const group = config.groups.find(g => g.name === c.group);
              const priorityNote = group && group.combined ? `**${c.priority}**` : '**' + c.priority + '** (not combined -- unused)';
              return (
                `• **${c.display}**\n` +
                `  Slug: \`${c.slug}\`\n` +
                `  Group: \`${c.group}\`\n` +
                `  Priority: ${priorityNote}`
              );
            })
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
