'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const logger = require('../../utils/logger');
const { PermissionChecker } = require('../../utils/permissions');
const scs = require('../../services/StreetCredService');
const analyticsService = require('../../services/AnalyticsService');
const CONSTANTS = require('../../config/constants');

// ─── Shared helpers ────────────────────────────────────────────────────────

function progressBar(current, max, length = 24) {
  if (max <= 0 || current >= max) return '█'.repeat(length);
  const filled = Math.round((current / max) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function formatScore(n) {
  return Math.round(n).toLocaleString();
}

function tierDisplay(tierKey, cfg) {
  if (tierKey < 1) return 'Unranked';
  const label = scs.getTierLabel(tierKey, cfg);
  return `${label} (Tier ${tierKey})`;
}

/**
 * Build the profile embed for a guild member.
 */
async function buildProfileEmbed(guild, member) {
  const [profile, cfg] = await Promise.all([
    scs.getProfile(member.id, guild.id),
    scs.getGuildConfig(guild.id),
  ]);

  if (!profile || profile.messages === 0) {
    return new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`🏙️ ${cfg.systemName} — ${member.displayName}`)
      .setDescription(`No ${cfg.systemName} data yet. Start chatting to earn your rank!`)
      .setThumbnail(member.displayAvatarURL({ size: 128 }));
  }

  const ja = profile.joined_at ? new Date(profile.joined_at) : (member.joinedAt || new Date());
  const months = scs.tenureMonths(ja);
  const multiplier = scs.tenureMultiplier(months, cfg.formula);
  const tier = profile.tier;
  const score = profile.effective_score;

  const nextThreshold = scs.nextTierThreshold(tier, cfg.tiers);
  const curThreshold = scs.currentTierThreshold(tier, cfg.tiers);
  const nextTierDef = scs.nextTier(tier, cfg.tiers);
  const thresholdRange = nextThreshold ? Math.max(1, nextThreshold - curThreshold) : 1;

  const progressPct = nextThreshold
    ? Math.min(100, Math.max(0, ((score - curThreshold) / thresholdRange) * 100))
    : 100;
  const bar = progressBar(Math.max(0, score - curThreshold), thresholdRange);

  const statusEmoji = profile.status === 'ACTIVE' ? '🟢' : profile.status === 'DORMANT' ? '🔴' : '⚫';
  const tierLabel = tierDisplay(tier, cfg);
  const nextLabel = nextTierDef ? tierDisplay(nextTierDef.tierKey, cfg) : 'Max Tier';

  let embedColor = 0xf1c40f;
  if (tier >= 1) {
    const roleId = cfg.tierByKey.get(tier)?.roleId;
    const role = roleId && guild.roles.cache.get(roleId);
    if (role && role.color) embedColor = role.color;
  }

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`🏙️ ${cfg.systemName} — ${member.displayName}`)
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: 'Tier', value: tierLabel, inline: true },
      { name: 'Status', value: `${statusEmoji} ${profile.status}`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      {
        name: `Progress to ${nextLabel}`,
        value: nextThreshold
          ? `${bar} ${progressPct.toFixed(1)}%\n${formatScore(score)} / ${formatScore(nextThreshold)}`
          : `${bar} MAX TIER`,
      },
      { name: 'Messages', value: profile.messages.toLocaleString(), inline: true },
      { name: 'Tenure', value: `${months} months`, inline: true },
      { name: 'Multiplier', value: `${multiplier.toFixed(2)}×`, inline: true },
      { name: 'Member Since', value: `<t:${Math.floor(ja.getTime() / 1000)}:D>`, inline: true }
    )
    .setFooter({ text: `Effective score: ${formatScore(score)}` });
}

// ─── /streetcred ─────────────────────────────────────────────────────────

const streetcredCommand = {
  data: new SlashCommandBuilder()
    .setName('streetcred')
    .setDescription('Check your StreetCred rank')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Check another member\'s rank').setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ content: '❌ Member not found in this server.', flags: MessageFlags.Ephemeral });
    }

    const isPublic = interaction.channelId === CONSTANTS.CHANNELS.BOT_SPAM;
    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
    const embed = await buildProfileEmbed(interaction.guild, targetMember);
    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /streetcred-leaderboard ──────────────────────────────────────────────────

const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName('streetcred-leaderboard')
    .setDescription('Show the StreetCred leaderboard')
    .addStringOption((opt) =>
      opt.setName('show')
        .setDescription('Which members to include')
        .setRequired(false)
        .addChoices(
          { name: 'Active only (default)', value: 'active' },
          { name: 'All (including dormant)', value: 'all' },
          { name: 'Members only (no staff)', value: 'members' }
        )
    ),

  async execute(interaction) {
    const show = interaction.options.getString('show') || 'active';
    const isPublic = interaction.channelId === CONSTANTS.CHANNELS.BOT_SPAM;
    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
    const embed = await buildLeaderboardEmbed(interaction.guild, interaction.user, 1, show);
    const row = buildLeaderboardButtons(1, show);
    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};

async function buildLeaderboardEmbed(guild, requestingUser, page, show) {
  const PAGE_SIZE = 10;
  const cfg = await scs.getGuildConfig(guild.id);

  if (show === 'members') {
    const allActive = await scs.getAllActive(guild.id);
    const staffRoleIds = new Set(Object.values(CONSTANTS.HELPER_ROLES));

    await guild.members.fetch().catch(() => {});

    const filtered = [];
    for (const rec of allActive) {
      const member = guild.members.cache.get(rec.user_id);
      const isStaff = member && member.roles.cache.some((r) => staffRoleIds.has(r.id));
      if (!isStaff) filtered.push(rec);
    }

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    const lines = [];
    for (let i = 0; i < pageRows.length; i++) {
      const rec = pageRows[i];
      const rank = start + i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**#${rank}**`;
      lines.push(`${medal} <@${rec.user_id}> — ${tierDisplay(rec.tier, cfg)} · ${formatScore(rec.effective_score)}`);
    }

    const userIdx = filtered.findIndex((r) => r.user_id === requestingUser.id);
    const userLine = userIdx !== -1
      ? (() => {
        const r = filtered[userIdx];
        return `\n\n> Your rank: **#${userIdx + 1}** — ${tierDisplay(r.tier, cfg)} · ${formatScore(r.effective_score)}`;
      })()
      : '';

    return new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🏙️ ${cfg.systemName} Leaderboard`)
      .setDescription((lines.join('\n') || 'No data yet.') + userLine)
      .setFooter({ text: `Page ${page}/${totalPages} · Members only (no staff)` });
  }

  const activeOnly = show !== 'all';
  const { rows, totalCount } = await scs.getLeaderboard(guild.id, page, PAGE_SIZE, activeOnly);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const lines = [];
  const start = (page - 1) * PAGE_SIZE + 1;
  for (let i = 0; i < rows.length; i++) {
    const rec = rows[i];
    const rank = start + i;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**#${rank}**`;
    const status = rec.status === 'DORMANT' ? ' *(dormant)*' : '';
    lines.push(`${medal} <@${rec.user_id}> — ${tierDisplay(rec.tier, cfg)} · ${formatScore(rec.effective_score)}${status}`);
  }

  const userRank = await scs.getUserRank(requestingUser.id, guild.id, activeOnly);
  const userProf = await scs.getProfile(requestingUser.id, guild.id);
  const userLine = userRank
    ? `\n\n> Your rank: **#${userRank}** — ${tierDisplay(userProf?.tier ?? 1, cfg)} · ${formatScore(userProf?.effective_score ?? 0)}`
    : '';

  const footerLabel = show === 'active' ? 'Active members' : 'All members';
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🏙️ ${cfg.systemName} Leaderboard`)
    .setDescription((lines.join('\n') || 'No data yet.') + userLine)
    .setFooter({ text: `Page ${page}/${totalPages} · ${footerLabel}` });
}

function buildLeaderboardButtons(page, show) {
  const prev = new ButtonBuilder()
    .setCustomId(`sc_lb_${page - 1}_${show}`)
    .setLabel('◀️ Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 1);

  const next = new ButtonBuilder()
    .setCustomId(`sc_lb_${page + 1}_${show}`)
    .setLabel('Next ▶️')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(prev, next);
}

function formatTierList(cfg) {
  if (!cfg.tiers.length) return '_No tiers configured._';
  return cfg.tiers
    .map((tier) => {
      const roleValue = tier.roleId ? `<@&${tier.roleId}>` : '—';
      return `Tier ${tier.tierKey}: **${tier.tierName}** · threshold **${formatScore(tier.threshold)}** · role ${roleValue}`;
    })
    .join('\n');
}

// ─── /streetcred-admin ────────────────────────────────────────────────────────

const adminCommand = {
  data: new SlashCommandBuilder()
    .setName('streetcred-admin')
    .setDescription('Admin commands for StreetCred (mod/admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName('scan')
        .setDescription('Start the one-time retroactive message scan')
    )
    .addSubcommand((sub) =>
      sub.setName('sync')
        .setDescription('Manually set a member\'s message count and recalculate')
        .addUserOption((o) => o.setName('user').setDescription('Target member').setRequired(true))
        .addIntegerOption((o) => o.setName('messages').setDescription('Message count').setRequired(true).setMinValue(0))
    )
    .addSubcommand((sub) =>
      sub.setName('status')
        .setDescription('Show StreetCred system status')
    )
    .addSubcommand((sub) =>
      sub.setName('recalculate')
        .setDescription('Recalculate all tiers from current data')
    )
    .addSubcommand((sub) =>
      sub.setName('dormancy')
        .setDescription('Change the dormancy threshold')
        .addIntegerOption((o) => o.setName('days').setDescription('Days of inactivity before going dormant').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub.setName('rescan')
        .setDescription('Rescan all channels for message timestamps (analytics only — no role changes)')
    )
    .addSubcommand((sub) =>
      sub.setName('rescan-reset')
        .setDescription('Reset analytics scan progress to allow a full rescan')
    )
    .addSubcommand((sub) =>
      sub.setName('config-show')
        .setDescription('Show effective StreetCred configuration for this guild')
    )
    .addSubcommand((sub) =>
      sub.setName('config-set-name')
        .setDescription('Set StreetCred system name')
        .addStringOption((o) => o.setName('name').setDescription('System name').setRequired(true).setMaxLength(100))
    )
    .addSubcommand((sub) =>
      sub.setName('config-set-dormancy')
        .setDescription('Set dormancy days for this guild')
        .addIntegerOption((o) => o.setName('days').setDescription('Dormancy days').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub.setName('config-set-formula')
        .setDescription('Set scoring formula for this guild')
        .addNumberOption((o) => o.setName('base_multiplier').setDescription('Base multiplier (> 0)').setRequired(true).setMinValue(0.000001))
        .addNumberOption((o) => o.setName('tenure_divisor').setDescription('Tenure divisor (> 0)').setRequired(true).setMinValue(0.000001))
    )
    .addSubcommand((sub) =>
      sub.setName('config-set-tier')
        .setDescription('Set a tier definition for this guild')
        .addIntegerOption((o) => o.setName('tier_key').setDescription('Tier key (>= 1)').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('tier_name').setDescription('Tier display name').setRequired(true).setMaxLength(100))
        .addNumberOption((o) => o.setName('threshold').setDescription('Effective score threshold (>= 0)').setRequired(true).setMinValue(0))
        .addRoleOption((o) => o.setName('role').setDescription('Role to assign for this tier').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('config-set-levelup-channel')
        .setDescription('Set level-up announcement channel for this guild')
        .addChannelOption((o) => o
          .setName('channel')
          .setDescription('Channel for level-up announcements')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    )
    .addSubcommand((sub) =>
      sub.setName('config-clear-levelup-channel')
        .setDescription('Clear level-up announcement channel override for this guild')
    )
    .addSubcommand((sub) =>
      sub.setName('config-remove-tier')
        .setDescription('Remove a guild-specific tier definition')
        .addIntegerOption((o) => o.setName('tier_key').setDescription('Tier key (>= 1)').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub.setName('config-reset')
        .setDescription('Reset this guild config to defaults')
    ),

  async execute(interaction) {
    if (!PermissionChecker.hasModRole(interaction.member) && !PermissionChecker.isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You need mod or admin privileges for this command.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'scan') return handleAdminScan(interaction);
    if (sub === 'sync') return handleAdminSync(interaction);
    if (sub === 'status') return handleAdminStatus(interaction);
    if (sub === 'recalculate') return handleAdminRecalculate(interaction);
    if (sub === 'dormancy') return handleAdminDormancy(interaction);
    if (sub === 'rescan') return handleAdminRescan(interaction);
    if (sub === 'rescan-reset') return handleAdminRescanReset(interaction);
    if (sub === 'config-show') return handleConfigShow(interaction);
    if (sub === 'config-set-name') return handleConfigSetName(interaction);
    if (sub === 'config-set-dormancy') return handleConfigSetDormancy(interaction);
    if (sub === 'config-set-formula') return handleConfigSetFormula(interaction);
    if (sub === 'config-set-tier') return handleConfigSetTier(interaction);
    if (sub === 'config-set-levelup-channel') return handleConfigSetLevelupChannel(interaction);
    if (sub === 'config-clear-levelup-channel') return handleConfigClearLevelupChannel(interaction);
    if (sub === 'config-remove-tier') return handleConfigRemoveTier(interaction);
    if (sub === 'config-reset') return handleConfigReset(interaction);
  },
};

// ── Admin: scan ────────────────────────────────────────────────────────────

async function handleAdminScan(interaction) {
  const cfg = await scs.getGuildConfig(interaction.guild.id);
  await interaction.reply({ content: `🔍 Starting retroactive ${cfg.systemName} scan…`, embeds: [] });

  const guild = interaction.guild;

  (async () => {
    let progressMsg = null;
    try {
      progressMsg = await interaction.channel.send({ embeds: [scanEmbed(cfg.systemName, 'STRIP', 0, 0, 0, 0)] });

      const { stripped, total: stripTotal } = await scs.stripAllRoles(guild, (done, tot) => {
        if (done % 50 === 0 || done === tot) {
          progressMsg.edit({ embeds: [scanEmbed(cfg.systemName, 'STRIP', done, tot, 0, 0)] }).catch(() => {});
        }
      });

      await progressMsg.edit({ embeds: [scanEmbed(cfg.systemName, 'SCAN', stripped, stripTotal, 0, 0)] });

      let scanChannelsDone = 0;
      let scanChannelsTotal = 0;
      let scanTotalMessages = 0;

      const result = await scs.runRetroactiveScan(
        guild,
        (chDone, chTotal, msgs) => {
          scanChannelsDone = chDone;
          scanChannelsTotal = chTotal;
          scanTotalMessages = msgs;
          progressMsg.edit({ embeds: [scanEmbed(cfg.systemName, 'SCAN', stripped, stripTotal, chDone, chTotal, msgs, 0, 0)] }).catch(() => {});
        },
        (assigned, assignTotal) => {
          if (assigned % 50 === 0 || assigned === assignTotal) {
            progressMsg.edit({ embeds: [scanEmbed(cfg.systemName, 'ASSIGN', stripped, stripTotal, scanChannelsDone, scanChannelsTotal, scanTotalMessages, assigned, assignTotal)] }).catch(() => {});
          }
        }
      );

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`✅ ${cfg.systemName} Scan Complete`)
        .addFields(
          { name: 'Roles Stripped', value: stripped.toLocaleString(), inline: true },
          { name: 'Channels Scanned', value: result.channelsDone.toLocaleString(), inline: true },
          { name: 'Messages Processed', value: result.totalMessages.toLocaleString(), inline: true },
          { name: 'Users Found', value: result.totalUsers.toLocaleString(), inline: true },
          { name: 'Roles Assigned', value: result.assigned.toLocaleString(), inline: true },
        )
        .setTimestamp();
      await progressMsg.edit({ embeds: [embed] });

    } catch (err) {
      logger.error(`[STREET_CRED] Admin scan failed: ${err.stack || err}`);
      const errEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('❌ Scan Failed')
        .setDescription(`An error occurred: ${err.message}`);
      if (progressMsg) progressMsg.edit({ embeds: [errEmbed] }).catch(() => {});
    }
  })();
}

function scanEmbed(systemName, phase, stripped, stripTotal, chDone, chTotal, msgs = 0, assigned = 0, assignTotal = 0) {
  const phases = {
    STRIP: '⚙️ Phase 1: Stripping existing roles…',
    SCAN: '🔍 Phase 2: Scanning channel history…',
    ASSIGN: '🎖️ Phase 4: Assigning roles…',
  };
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`🏙️ ${systemName} Scan In Progress`)
    .setDescription(phases[phase] || 'Working…')
    .addFields(
      { name: 'Roles Stripped', value: `${stripped.toLocaleString()} / ${stripTotal.toLocaleString()}`, inline: true },
      { name: 'Channels Scanned', value: `${chDone.toLocaleString()} / ${chTotal.toLocaleString()}`, inline: true },
      { name: 'Messages Read', value: msgs.toLocaleString(), inline: true },
      { name: 'Roles Assigned', value: `${assigned.toLocaleString()} / ${assignTotal.toLocaleString()}`, inline: true },
    )
    .setTimestamp();
}

// ── Admin: sync ────────────────────────────────────────────────────────────

async function handleAdminSync(interaction) {
  const targetUser = interaction.options.getUser('user');
  const messageCount = interaction.options.getInteger('messages');

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: '❌ Member not found.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [result, cfg] = await Promise.all([
    scs.adminSync(member.id, interaction.guild.id, messageCount, member.joinedAt),
    scs.getGuildConfig(interaction.guild.id),
  ]);
  await scs.applyTierRole(member, result.tier, cfg);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`✅ ${cfg.systemName} Synced`)
    .addFields(
      { name: 'Member', value: member.displayName, inline: true },
      { name: 'Messages', value: messageCount.toLocaleString(), inline: true },
      { name: 'New Tier', value: tierDisplay(result.tier, cfg), inline: true },
      { name: 'Score', value: formatScore(result.score), inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[STREET_CRED] Admin sync: ${member.user.tag} set to ${messageCount} messages → tier ${result.tier}`);
}

// ── Admin: status ──────────────────────────────────────────────────────────

async function handleAdminStatus(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [stats, cfg] = await Promise.all([
    scs.getStatusStats(interaction.guild.id),
    scs.getGuildConfig(interaction.guild.id),
  ]);
  const m = stats.members;
  const s = stats.scan;

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📊 ${cfg.systemName} System Status`)
    .addFields(
      { name: 'Total Tracked', value: String(m.total ?? 0), inline: true },
      { name: 'Active', value: String(m.active ?? 0), inline: true },
      { name: 'Dormant', value: String(m.dormant ?? 0), inline: true },
      { name: 'New (unranked)', value: String(m.newMembers ?? 0), inline: true },
      { name: 'Top Score', value: m.topScore ? formatScore(m.topScore) : 'N/A', inline: true },
      {
        name: 'Scan Progress',
        value: s.total ? `${s.completed}/${s.total} channels completed` : 'No scan run yet'
      },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── Admin: recalculate ────────────────────────────────────────────────────────

async function handleAdminRecalculate(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [count, cfg] = await Promise.all([
    scs.recalculateAll(interaction.guild.id, interaction.guild),
    scs.getGuildConfig(interaction.guild.id),
  ]);

  await interaction.editReply({
    content: `✅ Recalculated tiers for **${count.toLocaleString()}** members from current ${cfg.systemName} data.`,
  });
  logger.info(`[STREET_CRED] Admin recalculate: ${count} records updated`);
}

// ── Admin: dormancy ────────────────────────────────────────────────────────

async function handleAdminDormancy(interaction) {
  const days = interaction.options.getInteger('days');
  const cfg = await scs.setGuildConfigFields(interaction.guild.id, { dormancyDays: days });

  await interaction.reply({
    content: `✅ Dormancy threshold updated to **${days} days** for **${cfg.systemName}**.`,
    flags: MessageFlags.Ephemeral,
  });
  logger.info(`[STREET_CRED] Dormancy threshold changed to ${days} days in guild ${interaction.guild.id}`);
}

// ── Admin: config show/set ─────────────────────────────────────────────────

async function handleConfigShow(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cfg = await scs.getGuildConfig(interaction.guild.id, { noCache: true });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`⚙️ ${cfg.systemName} Configuration`)
    .addFields(
      { name: 'Source', value: cfg.source === 'guild_override' ? 'Guild override' : 'Defaults (not overridden for this guild)' },
      { name: 'System Name', value: cfg.systemName, inline: true },
      { name: 'Dormancy Days', value: String(cfg.dormancyDays), inline: true },
      { name: 'Level-up Channel', value: cfg.levelupChannelId ? `<#${cfg.levelupChannelId}>` : 'Not set (uses existing fallback)', inline: true },
      { name: 'Base Multiplier', value: String(cfg.formula.baseMultiplier), inline: true },
      { name: 'Tenure Divisor', value: String(cfg.formula.tenureDivisor), inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: `Tiers (${cfg.tiers.length})`, value: formatTierList(cfg) }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleConfigSetName(interaction) {
  const name = interaction.options.getString('name', true).trim();
  if (!name) {
    return interaction.reply({ content: '❌ Name cannot be empty.', flags: MessageFlags.Ephemeral });
  }

  const cfg = await scs.setGuildConfigFields(interaction.guild.id, { systemName: name });
  await interaction.reply({
    content: `✅ System name set to **${cfg.systemName}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigSetDormancy(interaction) {
  const days = interaction.options.getInteger('days', true);
  const cfg = await scs.setGuildConfigFields(interaction.guild.id, { dormancyDays: days });
  await interaction.reply({
    content: `✅ Dormancy threshold set to **${cfg.dormancyDays} days**.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigSetFormula(interaction) {
  const baseMultiplier = interaction.options.getNumber('base_multiplier', true);
  const tenureDivisor = interaction.options.getNumber('tenure_divisor', true);

  if (baseMultiplier <= 0 || tenureDivisor <= 0) {
    return interaction.reply({
      content: '❌ base_multiplier and tenure_divisor must both be > 0.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const cfg = await scs.setGuildConfigFields(interaction.guild.id, { baseMultiplier, tenureDivisor });
  await interaction.reply({
    content: `✅ Formula updated. Effective score now uses base=${cfg.formula.baseMultiplier}, tenureDivisor=${cfg.formula.tenureDivisor}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigSetTier(interaction) {
  const tierKey = interaction.options.getInteger('tier_key', true);
  const tierName = interaction.options.getString('tier_name', true).trim();
  const threshold = interaction.options.getNumber('threshold', true);
  const role = interaction.options.getRole('role');

  if (!tierName) {
    return interaction.reply({ content: '❌ tier_name cannot be empty.', flags: MessageFlags.Ephemeral });
  }

  const cfg = await scs.setGuildTier(interaction.guild.id, {
    tierKey,
    tierName,
    threshold,
    roleId: role ? role.id : null,
  });

  await interaction.reply({
    content: `✅ Tier ${tierKey} updated to **${scs.getTierLabel(tierKey, cfg)}** at threshold **${formatScore(threshold)}**${role ? ` with role <@&${role.id}>` : ' with no role'}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigSetLevelupChannel(interaction) {
  const channel = interaction.options.getChannel('channel', true);
  if (!channel.isTextBased()) {
    return interaction.reply({ content: '❌ Level-up channel must be text-based.', flags: MessageFlags.Ephemeral });
  }

  await scs.setGuildConfigFields(interaction.guild.id, { levelupChannelId: channel.id });
  await interaction.reply({
    content: `✅ Level-up announcements will be sent to ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigClearLevelupChannel(interaction) {
  await scs.setGuildConfigFields(interaction.guild.id, { levelupChannelId: null });
  await interaction.reply({
    content: '✅ Cleared guild level-up announcement channel override.',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigRemoveTier(interaction) {
  const tierKey = interaction.options.getInteger('tier_key', true);
  await scs.removeGuildTier(interaction.guild.id, tierKey);
  await interaction.reply({
    content: `✅ Removed guild-specific definition for tier ${tierKey}. Defaults apply only if no guild tiers remain.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfigReset(interaction) {
  await scs.resetGuildConfig(interaction.guild.id);
  await interaction.reply({
    content: '✅ Guild StreetCred config reset to defaults source.',
    flags: MessageFlags.Ephemeral,
  });
}

// ── Admin: rescan ──────────────────────────────────────────────────────────

async function handleAdminRescan(interaction) {
  await interaction.reply({ content: '🔍 Starting analytics message scan…', embeds: [] });

  const guild = interaction.guild;

  (async () => {
    let progressMsg = null;
    try {
      progressMsg = await interaction.channel.send({
        embeds: [analyticsRescanEmbed(0, 0, 0)],
      });

      const result = await analyticsService.runMessageScan(guild, (chDone, chTotal, msgs) => {
        progressMsg.edit({ embeds: [analyticsRescanEmbed(chDone, chTotal, msgs)] }).catch(() => {});
      });

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Analytics Message Scan Complete')
        .addFields(
          { name: 'Channels Scanned', value: result.channelsDone.toLocaleString(), inline: true },
          { name: 'Messages Stored', value: result.totalMessages.toLocaleString(), inline: true },
        )
        .setTimestamp();
      await progressMsg.edit({ embeds: [embed] });

    } catch (err) {
      logger.error(`[ANALYTICS] Admin rescan failed: ${err.stack || err}`);
      const errEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('❌ Analytics Scan Failed')
        .setDescription(`An error occurred: ${err.message}`);
      if (progressMsg) progressMsg.edit({ embeds: [errEmbed] }).catch(() => {});
    }
  })();
}

function analyticsRescanEmbed(chDone, chTotal, msgs) {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🔍 Analytics Message Scan In Progress')
    .addFields(
      { name: 'Channels Scanned', value: `${chDone.toLocaleString()} / ${chTotal.toLocaleString()}`, inline: true },
      { name: 'Messages Stored', value: msgs.toLocaleString(), inline: true },
    )
    .setTimestamp();
}

// ── Admin: rescan-reset ────────────────────────────────────────────────────────

async function handleAdminRescanReset(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await analyticsService.resetScan(interaction.guild.id);

  await interaction.editReply({
    content: '✅ Analytics scan progress reset. You can now run `/streetcred-admin rescan` for a full rescan.',
  });
  logger.info(`[ANALYTICS] Scan progress reset by ${interaction.user.tag}`);
}

// ─── Button handler registration ───────────────────────────────────────────────

async function handleLeaderboardButton(interaction) {
  const parts = interaction.customId.split('_');
  const page = parseInt(parts[2], 10);
  const show = parts[3];

  await interaction.deferUpdate();
  const embed = await buildLeaderboardEmbed(interaction.guild, interaction.user, page, show);
  const row = buildLeaderboardButtons(page, show);
  await interaction.editReply({ embeds: [embed], components: [row] });
}

module.exports = [streetcredCommand, leaderboardCommand, adminCommand];
module.exports.handleLeaderboardButton = handleLeaderboardButton;
