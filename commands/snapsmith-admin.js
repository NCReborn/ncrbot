'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const logger = require('../utils/logger');
const { PermissionChecker } = require('../utils/permissions');
const snapsmith = require('../services/SnapSmithService');

// ─── /snapsmith-admin init ────────────────────────────────────────────────────

const adminCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-admin')
    .setDescription('Admin commands for SnapSmith (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('init')
        .setDescription('Initialize all current SnapSmiths with 30-day timers')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Show SnapSmith system status')
    ),

  async execute(interaction) {
    // Permission check
    if (!PermissionChecker.isAdmin(interaction.member)) {
      return interaction.reply({ 
        content: '❌ You need admin privileges for this command.', 
        flags: MessageFlags.Ephemeral 
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'init') return handleAdminInit(interaction);
    if (sub === 'status') return handleAdminStatus(interaction);
  },
};

// ─── Admin: init ──────────────────────────────────────────────────────────────

async function handleAdminInit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await snapsmith.initializeCurrentSnapSmiths(interaction.guild);

    const embed = new EmbedBuilder()
      .setColor(result.success ? 0x2ecc71 : 0xe74c3c)
      .setTitle('🔧 SnapSmith Initialization')
      .setDescription(result.success 
        ? `✅ Successfully initialized **${result.initialized}** current SnapSmiths with 30-day timers.`
        : `❌ Initialization failed: ${result.message}`
      );

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[SNAPSMITH] Init command executed by ${interaction.user.tag} - initialized ${result.initialized} users`);
  } catch (err) {
    logger.error(`[SNAPSMITH] Admin init failed: ${err.message}`);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('❌ Initialization Failed')
      .setDescription(`An error occurred: ${err.message}`);
    await interaction.editReply({ embeds: [embed] });
  }
}

// ─── Admin: status ────────────────────────────────────────────────────────────

async function handleAdminStatus(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { getPool } = require('../utils/database');
    const pool = await getPool();

    const [stats] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(is_active = 1) AS active,
         SUM(is_banned = 1) AS banned,
         SUM(expires_at IS NOT NULL AND expires_at > NOW()) AS expiring_soon
       FROM snapsmith
       WHERE guild_id = ?`,
      [interaction.guild.id]
    );

    const row = stats[0];
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('📊 SnapSmith System Status')
      .addFields(
        { name: 'Total Tracked', value: String(row.total ?? 0), inline: true },
        { name: 'Currently Active', value: String(row.active ?? 0), inline: true },
        { name: 'Banned', value: String(row.banned ?? 0), inline: true },
        { name: 'Grant Duration', value: `${snapsmith.GRANT_DURATION_DAYS} days`, inline: true },
        { name: 'Role ID', value: snapsmith.ROLE_ID, inline: true },
        { name: 'Showcase Channel', value: `<#${snapsmith.SHOWCASE_CHANNEL}>`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error(`[SNAPSMITH] Admin status failed: ${err.message}`);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('❌ Status Check Failed')
      .setDescription(`An error occurred: ${err.message}`);
    await interaction.editReply({ embeds: [embed] });
  }
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = [adminCommand];
