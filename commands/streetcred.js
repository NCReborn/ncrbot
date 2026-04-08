'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const logger = require('../utils/logger');
const { PermissionChecker } = require('../utils/permissions');
const scs = require('../services/StreetCredService');
const analyticsService = require('../services/AnalyticsService');

// ─── Shared helpers ───────────────────────────────────────────────────────────

function progressBar(current, max, length = 24) {
  if (max <= 0 || current >= max) return '█'.repeat(length);
  const filled = Math.round((current / max) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function formatScore(n) {
  return Math.round(n).toLocaleString();
}

/**
 * Build the profile embed for a guild member.
 */
async function buildProfileEmbed(guild, member, user) {
  const profile = await scs.getProfile(member.id, guild.id);

  if (!profile || profile.messages === 0) {
    return new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`🏙️ Street Creed — ${member.displayName}`)
      .setDescription('No Street Creed data yet. Start chatting to earn your rank!')
      .setThumbnail(member.displayAvatarURL({ size: 128 }));
  }

  const ja = profile.joined_at ? new Date(profile.joined_at) : (member.joinedAt || new Date());
  const months = scs.tenureMonths(ja);
  const multiplier = scs.tenureMultiplier(months);
  const tier = profile.tier;
  const score = profile.effective_score;

  const nextThreshold = scs.nextTierThreshold(tier);
  const curThreshold  = scs.currentTierThreshold(tier);
  const progressPct   = nextThreshold
    ? Math.min(100, ((score - curThreshold) / (nextThreshold - curThreshold)) * 100)
    : 100;
  const bar = progressBar(score - curThreshold, nextThreshold ? nextThreshold - curThreshold : 1);

  const statusEmoji = profile.status === 'ACTIVE' ? '🟢' : profile.status === 'DORMANT' ? '🔴' : '⚫';
  const tierLabel   = tier >= 1 ? `SC-${tier}` : 'Unranked';
  const nextLabel   = nextThreshold ? (tier === 0 ? 'SC-1' : `SC-${scs.TIERS[scs.TIERS.indexOf(tier) - 1]}`) : 'Max Tier';

  // Try to get the role colour
  let embedColor = 0xf1c40f;
  if (tier >= 1) {
    const roleId = scs.ROLE_MAP[String(tier)];
    const role = roleId && guild.roles.cache.get(roleId);
    if (role && role.color) embedColor = role.color;
  }

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`🏙️ Street Creed — ${member.displayName}`)
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: 'Tier',    value: tierLabel,                             inline: true },
      { name: 'Status',  value: `${statusEmoji} ${profile.status}`,   inline: true },
      { name: '\u200b',  value: '\u200b',                              inline: true },
      {
        name: `Progress to ${nextLabel}`,
        value: nextThreshold
          ? `${bar} ${progressPct.toFixed(1)}%\n${formatScore(score)} / ${formatScore(nextThreshold)}`
          : `${bar} MAX TIER`,
      },
      { name: 'Messages',    value: profile.messages.toLocaleString(), inline: true },
      { name: 'Tenure',      value: `${months} months`,                inline: true },
      { name: 'Multiplier',  value: `${multiplier.toFixed(2)}×`,       inline: true },
      { name: 'Member Since', value: `<t:${Math.floor(ja.getTime() / 1000)}:D>`, inline: true }
    )
    .setFooter({ text: `Effective score: ${formatScore(score)}` });
}

// ─── /streetcred ─────────────────────────────────────────────────────────────

const streetcredCommand = {
  data: new SlashCommandBuilder()
    .setName('streetcred')
    .setDescription('Check your Street Creed rank')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Check another member\'s rank').setRequired(false)
    ),

  async execute(interaction) {
    const targetUser   = interaction.options.getUser('user') || interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ content: '❌ Member not found in this server.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();
    const embed = await buildProfileEmbed(interaction.guild, targetMember, targetUser);
    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /streetcred-leaderboard ──────────────────────────────────────────────────

const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName('streetcred-leaderboard')
    .setDescription('Show the Street Creed leaderboard')
    .addStringOption(opt =>
      opt.setName('show')
        .setDescription('Which members to include')
        .setRequired(false)
        .addChoices(
          { name: 'Active only (default)', value: 'active' },
          { name: 'All (including dormant)', value: 'all' }
        )
    ),

  async execute(interaction) {
    const show      = interaction.options.getString('show') || 'active';
    const activeOnly = show === 'active';
    await interaction.deferReply();
    const embed = await buildLeaderboardEmbed(interaction.guild, interaction.user, 1, activeOnly);
    const row   = buildLeaderboardButtons(1, activeOnly);
    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};

async function buildLeaderboardEmbed(guild, requestingUser, page, activeOnly) {
  const PAGE_SIZE = 10;
  const { rows, totalCount } = await scs.getLeaderboard(guild.id, page, PAGE_SIZE, activeOnly);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const lines = [];
  const start = (page - 1) * PAGE_SIZE + 1;
  for (let i = 0; i < rows.length; i++) {
    const rec    = rows[i];
    const rank   = start + i;
    const medal  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**#${rank}**`;
    const status = rec.status === 'DORMANT' ? ' *(dormant)*' : '';
    let username = `<@${rec.user_id}>`;
    lines.push(`${medal} ${username} — SC-${rec.tier} · ${formatScore(rec.effective_score)}${status}`);
  }

  const userRank  = await scs.getUserRank(requestingUser.id, guild.id, activeOnly);
  const userProf  = await scs.getProfile(requestingUser.id, guild.id);
  const userLine  = userRank
    ? `\n\n> Your rank: **#${userRank}** — SC-${userProf?.tier ?? 1} · ${formatScore(userProf?.effective_score ?? 0)}`
    : '';

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏙️ Street Creed Leaderboard')
    .setDescription((lines.join('\n') || 'No data yet.') + userLine)
    .setFooter({ text: `Page ${page}/${totalPages} · ${activeOnly ? 'Active members' : 'All members'}` });
}

function buildLeaderboardButtons(page, activeOnly) {
  const showVal = activeOnly ? 'active' : 'all';
  const prev = new ButtonBuilder()
    .setCustomId(`sc_lb_${page - 1}_${showVal}`)
    .setLabel('◀️ Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 1);

  const next = new ButtonBuilder()
    .setCustomId(`sc_lb_${page + 1}_${showVal}`)
    .setLabel('Next ▶️')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(prev, next);
}

// ─── /streetcred-admin ────────────────────────────────────────────────────────

const adminCommand = {
  data: new SlashCommandBuilder()
    .setName('streetcred-admin')
    .setDescription('Admin commands for Street Creed (mod/admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('scan')
        .setDescription('Start the one-time retroactive message scan')
    )
    .addSubcommand(sub =>
      sub.setName('sync')
        .setDescription('Manually set a member\'s message count and recalculate')
        .addUserOption(o => o.setName('user').setDescription('Target member').setRequired(true))
        .addIntegerOption(o => o.setName('messages').setDescription('Message count').setRequired(true).setMinValue(0))
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Show Street Creed system status')
    )
    .addSubcommand(sub =>
      sub.setName('recalculate')
        .setDescription('Recalculate all tiers from current data')
    )
    .addSubcommand(sub =>
      sub.setName('dormancy')
        .setDescription('Change the dormancy threshold')
        .addIntegerOption(o => o.setName('days').setDescription('Days of inactivity before going dormant').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('rescan')
        .setDescription('Rescan all channels for message timestamps (analytics only — no role changes)')
    )
    .addSubcommand(sub =>
      sub.setName('rescan-reset')
        .setDescription('Reset analytics scan progress to allow a full rescan')
    ),

  async execute(interaction) {
    // Permission check
    if (!PermissionChecker.hasModRole(interaction.member) && !PermissionChecker.isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You need mod or admin privileges for this command.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'scan')          return handleAdminScan(interaction);
    if (sub === 'sync')          return handleAdminSync(interaction);
    if (sub === 'status')        return handleAdminStatus(interaction);
    if (sub === 'recalculate')   return handleAdminRecalculate(interaction);
    if (sub === 'dormancy')      return handleAdminDormancy(interaction);
    if (sub === 'rescan')        return handleAdminRescan(interaction);
    if (sub === 'rescan-reset')  return handleAdminRescanReset(interaction);
  },
};

// ── Admin: scan ───────────────────────────────────────────────────────────────

async function handleAdminScan(interaction) {
  await interaction.reply({ content: '🔍 Starting retroactive Street Creed scan…', embeds: [] });

  const guild = interaction.guild;

  // Run async in background
  (async () => {
    let progressMsg = null;
    try {
      progressMsg = await interaction.channel.send({ embeds: [scanEmbed('STRIP', 0, 0, 0, 0)] });

      // Phase 1: Strip
      const { stripped, total: stripTotal } = await scs.stripAllRoles(guild, (done, tot) => {
        if (done % 50 === 0 || done === tot) {
          progressMsg.edit({ embeds: [scanEmbed('STRIP', done, tot, 0, 0)] }).catch(() => {});
        }
      });

      await progressMsg.edit({ embeds: [scanEmbed('SCAN', stripped, stripTotal, 0, 0)] });

      // Phase 2–4: Scan + calculate + assign
      let scanChannelsDone = 0;
      let scanChannelsTotal = 0;
      let scanTotalMessages = 0;

      const result = await scs.runRetroactiveScan(
        guild,
        (chDone, chTotal, msgs) => {
          scanChannelsDone = chDone;
          scanChannelsTotal = chTotal;
          scanTotalMessages = msgs;
          progressMsg.edit({ embeds: [scanEmbed('SCAN', stripped, stripTotal, chDone, chTotal, msgs, 0, 0)] }).catch(() => {});
        },
        (assigned, assignTotal) => {
          if (assigned % 50 === 0 || assigned === assignTotal) {
            progressMsg.edit({ embeds: [scanEmbed('ASSIGN', stripped, stripTotal, scanChannelsDone, scanChannelsTotal, scanTotalMessages, assigned, assignTotal)] }).catch(() => {});
          }
        }
      );

      // Phase 5: Report
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Street Creed Scan Complete')
        .addFields(
          { name: 'Roles Stripped',    value: stripped.toLocaleString(),          inline: true },
          { name: 'Channels Scanned',  value: result.channelsDone.toLocaleString(), inline: true },
          { name: 'Messages Processed', value: result.totalMessages.toLocaleString(), inline: true },
          { name: 'Users Found',       value: result.totalUsers.toLocaleString(), inline: true },
          { name: 'Roles Assigned',    value: result.assigned.toLocaleString(),   inline: true },
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

function scanEmbed(phase, stripped, stripTotal, chDone, chTotal, msgs = 0, assigned = 0, assignTotal = 0) {
  const phases = {
    STRIP:  '⚙️ Phase 1: Stripping existing roles…',
    SCAN:   '🔍 Phase 2: Scanning channel history…',
    ASSIGN: '🎖️ Phase 4: Assigning roles…',
  };
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🏙️ Street Creed Scan In Progress')
    .setDescription(phases[phase] || 'Working…')
    .addFields(
      { name: 'Roles Stripped',    value: `${stripped.toLocaleString()} / ${stripTotal.toLocaleString()}`,   inline: true },
      { name: 'Channels Scanned',  value: `${chDone.toLocaleString()} / ${chTotal.toLocaleString()}`,        inline: true },
      { name: 'Messages Read',     value: msgs.toLocaleString(),                                              inline: true },
      { name: 'Roles Assigned',    value: `${assigned.toLocaleString()} / ${assignTotal.toLocaleString()}`,  inline: true },
    )
    .setTimestamp();
}

// ── Admin: sync ───────────────────────────────────────────────────────────────

async function handleAdminSync(interaction) {
  const targetUser   = interaction.options.getUser('user');
  const messageCount = interaction.options.getInteger('messages');

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: '❌ Member not found.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await scs.adminSync(member.id, interaction.guild.id, messageCount, member.joinedAt);
  await scs.applyTierRole(member, result.tier);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('✅ Street Creed Synced')
    .addFields(
      { name: 'Member',   value: member.displayName,         inline: true },
      { name: 'Messages', value: messageCount.toLocaleString(), inline: true },
      { name: 'New Tier', value: result.tier >= 1 ? `SC-${result.tier}` : 'Unranked', inline: true },
      { name: 'Score',    value: formatScore(result.score),  inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[STREET_CRED] Admin sync: ${member.user.tag} set to ${messageCount} messages → SC-${result.tier}`);
}

// ── Admin: status ─────────────────────────────────────────────────────────────

async function handleAdminStatus(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const stats = await scs.getStatusStats(interaction.guild.id);
  const m = stats.members;
  const s = stats.scan;

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('📊 Street Creed System Status')
    .addFields(
      { name: 'Total Tracked',  value: String(m.total ?? 0),      inline: true },
      { name: 'Active',         value: String(m.active ?? 0),     inline: true },
      { name: 'Dormant',        value: String(m.dormant ?? 0),    inline: true },
      { name: 'New (unranked)', value: String(m.newMembers ?? 0), inline: true },
      { name: 'Top Score',      value: m.topScore ? formatScore(m.topScore) : 'N/A', inline: true },
      { name: 'Scan Progress',
        value: s.total ? `${s.completed}/${s.total} channels completed` : 'No scan run yet'
      },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── Admin: recalculate ────────────────────────────────────────────────────────

async function handleAdminRecalculate(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const count = await scs.recalculateAll(interaction.guild.id);

  await interaction.editReply({
    content: `✅ Recalculated tiers for **${count.toLocaleString()}** members from current data.`,
  });
  logger.info(`[STREET_CRED] Admin recalculate: ${count} records updated`);
}

// ── Admin: dormancy ───────────────────────────────────────────────────────────

async function handleAdminDormancy(interaction) {
  const days = interaction.options.getInteger('days');

  // Mutate the in-memory config (takes effect until next restart)
  const config = require('../config/streetCredConfig.json');
  config.dormancyDays = days;

  // Persist to disk
  const fs   = require('fs');
  const path = require('path');
  fs.writeFileSync(
    path.join(__dirname, '../config/streetCredConfig.json'),
    JSON.stringify(config, null, 2)
  );

  await interaction.reply({
    content: `✅ Dormancy threshold updated to **${days} days**. (Effective immediately — bot restart not required.)`,
    flags: MessageFlags.Ephemeral,
  });
  logger.info(`[STREET_CRED] Dormancy threshold changed to ${days} days`);
}

// ── Admin: rescan ─────────────────────────────────────────────────────────────

async function handleAdminRescan(interaction) {
  await interaction.reply({ content: '🔍 Starting analytics message scan…', embeds: [] });

  const guild = interaction.guild;

  // Run async in background
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
          { name: 'Messages Stored',  value: result.totalMessages.toLocaleString(), inline: true },
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
      { name: 'Messages Stored',  value: msgs.toLocaleString(), inline: true },
    )
    .setTimestamp();
}

// ── Admin: rescan-reset ───────────────────────────────────────────────────────

async function handleAdminRescanReset(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await analyticsService.resetScan(interaction.guild.id);

  await interaction.editReply({
    content: '✅ Analytics scan progress reset. You can now run `/streetcred-admin rescan` for a full rescan.',
  });
  logger.info(`[ANALYTICS] Scan progress reset by ${interaction.user.tag}`);
}

// ─── Button handler registration ──────────────────────────────────────────────
// Exports a handleButton function that buttonHandlers.js will call for sc_lb_* IDs.

async function handleLeaderboardButton(interaction) {
  const parts    = interaction.customId.split('_'); // sc_lb_<page>_<show>
  const page     = parseInt(parts[2], 10);
  const activeOnly = parts[3] === 'active';

  await interaction.deferUpdate();
  const embed = await buildLeaderboardEmbed(interaction.guild, interaction.user, page, activeOnly);
  const row   = buildLeaderboardButtons(page, activeOnly);
  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = [streetcredCommand, leaderboardCommand, adminCommand];

// Attach handleLeaderboardButton so buttonHandlers.js can import it
module.exports.handleLeaderboardButton = handleLeaderboardButton;
