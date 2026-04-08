'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { PermissionChecker } = require('../utils/permissions');
const analytics = require('../services/AnalyticsService');

// Month name lookup
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Format a 'YYYY-MM' string into a month name (e.g. 'January').
 */
function monthName(yyyyMm) {
  const parts = yyyyMm.split('-');
  const m = parseInt(parts[1], 10);
  return MONTH_NAMES[m - 1] || yyyyMm;
}

// ─── /analytics ───────────────────────────────────────────────────────────────

const analyticsCommand = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('Server analytics (mod/admin only)')
    .addSubcommand(sub =>
      sub.setName('members')
        .setDescription('Members joined per month for a given year')
        .addIntegerOption(o =>
          o.setName('year')
            .setDescription('Year to view (default: current year)')
            .setRequired(false)
            .setMinValue(2015)
            .setMaxValue(2100)
        )
    )
    .addSubcommand(sub =>
      sub.setName('messages')
        .setDescription('Message statistics for a given year')
        .addIntegerOption(o =>
          o.setName('year')
            .setDescription('Year to view (default: current year)')
            .setRequired(false)
            .setMinValue(2015)
            .setMaxValue(2100)
        )
    )
    .addSubcommand(sub =>
      sub.setName('activity')
        .setDescription('Active vs dormant member breakdown')
    )
    .addSubcommand(sub =>
      sub.setName('overview')
        .setDescription('Dashboard-style server analytics summary')
    ),

  async execute(interaction) {
    if (!PermissionChecker.hasModRole(interaction.member) && !PermissionChecker.isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You need mod or admin privileges for this command.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'members')  return handleMembers(interaction);
    if (sub === 'messages') return handleMessages(interaction);
    if (sub === 'activity') return handleActivity(interaction);
    if (sub === 'overview') return handleOverview(interaction);
  },
};

// ── /analytics members ────────────────────────────────────────────────────────

async function handleMembers(interaction) {
  await interaction.deferReply();

  const currentYear = new Date().getFullYear();
  const year = interaction.options.getInteger('year') || currentYear;
  const guildId = interaction.guild.id;

  const byMonth = await analytics.getMembersJoinedByMonth(guildId, year);
  const monthMap = new Map(byMonth.map(r => [r.month, Number(r.count)]));

  const fields = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const count = monthMap.get(key) ?? 0;
    fields.push({ name: MONTH_NAMES[m - 1], value: count.toLocaleString(), inline: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📊 Member Join Analytics — ${year}`)
    .addFields(fields);

  if (year === currentYear) {
    const ytd = await analytics.getMembersJoinedYTD(guildId);
    embed.setFooter({ text: `Members joined YTD (${year}): ${Number(ytd).toLocaleString()}` });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ── /analytics messages ───────────────────────────────────────────────────────

async function handleMessages(interaction) {
  await interaction.deferReply();

  const currentYear = new Date().getFullYear();
  const year = interaction.options.getInteger('year') || currentYear;
  const guildId = interaction.guild.id;

  const [byMonth, avgMonthly, busiest] = await Promise.all([
    analytics.getMessagesByMonth(guildId, year),
    analytics.getAverageMonthlyMessages(guildId),
    analytics.getBusiestMonth(guildId),
  ]);

  const monthMap = new Map(byMonth.map(r => [r.month, Number(r.count)]));

  const fields = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const count = monthMap.get(key) ?? 0;
    fields.push({ name: MONTH_NAMES[m - 1], value: count.toLocaleString(), inline: true });
  }

  fields.push({ name: 'Avg Monthly Messages', value: Number(avgMonthly).toLocaleString(), inline: true });

  if (busiest) {
    fields.push({
      name: 'Busiest Month (All Time)',
      value: `${monthName(busiest.month)} ${busiest.month.split('-')[0]} — ${Number(busiest.count).toLocaleString()} messages`,
      inline: true,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`💬 Message Analytics — ${year}`)
    .addFields(fields);

  if (year === currentYear) {
    const ytd = await analytics.getMessagesYTD(guildId);
    embed.setFooter({ text: `Messages YTD (${year}): ${Number(ytd).toLocaleString()}` });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ── /analytics activity ───────────────────────────────────────────────────────

async function handleActivity(interaction) {
  await interaction.deferReply();

  const guildId = interaction.guild.id;
  const [breakdown, topChannels] = await Promise.all([
    analytics.getActivityBreakdown(guildId),
    analytics.getTopChannels(guildId, 5),
  ]);

  const { active, dormant, new: newCount, total } = breakdown;
  const pct = n => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

  const channelLines = topChannels.length
    ? topChannels.map((r, i) => `${i + 1}. <#${r.channel_id}> — ${Number(r.count).toLocaleString()} messages`).join('\n')
    : 'No data yet.';

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📈 Activity Breakdown')
    .addFields(
      { name: '🟢 Active',  value: `${active.toLocaleString()} (${pct(active)})`,   inline: true },
      { name: '🔴 Dormant', value: `${dormant.toLocaleString()} (${pct(dormant)})`, inline: true },
      { name: '⚫ New',      value: `${newCount.toLocaleString()} (${pct(newCount)})`, inline: true },
      { name: 'Total Tracked', value: total.toLocaleString(), inline: true },
      { name: '🏆 Top 5 Channels', value: channelLines },
    );

  await interaction.editReply({ embeds: [embed] });
}

// ── /analytics overview ───────────────────────────────────────────────────────

async function handleOverview(interaction) {
  await interaction.deferReply();

  const guildId = interaction.guild.id;

  const [
    totalMessages,
    membersYTD,
    messagesYTD,
    avgMonthly,
    breakdown,
    busiest,
    topChannels,
  ] = await Promise.all([
    analytics.getTotalMessages(guildId),
    analytics.getMembersJoinedYTD(guildId),
    analytics.getMessagesYTD(guildId),
    analytics.getAverageMonthlyMessages(guildId),
    analytics.getActivityBreakdown(guildId),
    analytics.getBusiestMonth(guildId),
    analytics.getTopChannels(guildId, 5),
  ]);

  const { active, dormant, new: newCount, total } = breakdown;

  const channelLines = topChannels.length
    ? topChannels.map((r, i) => `${i + 1}. <#${r.channel_id}> — ${Number(r.count).toLocaleString()} messages`).join('\n')
    : 'No data yet.';

  const busiestText = busiest
    ? `${monthName(busiest.month)} ${busiest.month.split('-')[0]} — ${Number(busiest.count).toLocaleString()} messages`
    : 'No data yet.';

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏙️ Server Analytics Dashboard')
    .addFields(
      { name: 'Total Members Tracked', value: total.toLocaleString(),                      inline: true },
      { name: 'Total Messages Stored', value: Number(totalMessages).toLocaleString(),       inline: true },
      { name: 'Members Joined YTD',    value: Number(membersYTD).toLocaleString(),          inline: true },
      { name: 'Messages YTD',          value: Number(messagesYTD).toLocaleString(),         inline: true },
      { name: 'Avg Monthly Messages',  value: Number(avgMonthly).toLocaleString(),          inline: true },
      { name: '🟢 Active',             value: active.toLocaleString(),                      inline: true },
      { name: '🔴 Dormant',            value: dormant.toLocaleString(),                     inline: true },
      { name: '⚫ New',                 value: newCount.toLocaleString(),                    inline: true },
      { name: 'Busiest Month',         value: busiestText,                                  inline: false },
      { name: '🏆 Top 5 Channels',     value: channelLines,                                 inline: false },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = [analyticsCommand];
