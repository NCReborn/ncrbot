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
const CONSTANTS = require('../config/constants');

// ─── Helper: Check if user is Ripperdoc+ ──────────────────────────────────────

function isRipperdocPlus(member) {
  return member.roles.cache.has(snapsmith.RIPPERDOC_ROLE) || 
         PermissionChecker.isAdmin(member);
}

// ─── /snapsmith (check status) ─────────────────────────────────────────────────

const checkCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith')
    .setDescription('Check your SnapSmith status and remaining time')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Check another member\'s status').setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ 
        content: '❌ Member not found in this server.', 
        flags: MessageFlags.Ephemeral 
      });
    }

    const isPublic = interaction.channelId === CONSTANTS.CHANNELS.BOT_SPAM;
    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const record = await snapsmith.getSnapSmith(targetUser.id, interaction.guild.id);

    // Not a SnapSmith or inactive
    if (!record || record.is_active !== 1) {
      const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle(`🔧 SnapSmith — ${targetMember.displayName}`)
        .setDescription('Not currently a SnapSmith.')
        .setThumbnail(targetMember.displayAvatarURL({ size: 128 }));
      return interaction.editReply({ embeds: [embed] });
    }

    // Active SnapSmith
    const daysLeft = snapsmith.daysRemaining(record.expires_at);
    const timeRemaining = snapsmith.formatTimeRemaining(record.expires_at);
    const grantedDate = record.granted_at ? new Date(record.granted_at) : null;

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle(`🔧 SnapSmith — ${targetMember.displayName}`)
      .setThumbnail(targetMember.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'Status', value: '✅ ACTIVE', inline: true },
        { name: 'Time Remaining', value: timeRemaining, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { 
          name: 'Days Left', 
          value: daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'Expired', 
          inline: true 
        },
      );

    if (grantedDate) {
      embed.addFields({
        name: 'Granted',
        value: `<t:${Math.floor(grantedDate.getTime() / 1000)}:D>`,
        inline: true
      });
    }

    if (record.expires_at) {
      embed.addFields({
        name: 'Expires',
        value: `<t:${Math.floor(new Date(record.expires_at).getTime() / 1000)}:D>`,
        inline: true
      });
    }

    embed.setFooter({ text: 'Post in the showcase to refresh your timer!' });

    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /snapsmith grant <user> (Ripperdoc+ only) ────────────────────────────────

const grantCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-grant')
    .setDescription('Grant SnapSmith role to a user (Ripperdoc+ only)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to grant role to').setRequired(true)
    ),

  async execute(interaction) {
    if (!isRipperdocPlus(interaction.member)) {
      return interaction.reply({
        content: '❌ Only Ripperdocs+ can use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({
        content: '❌ Member not found in this server.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (targetUser.bot) {
      return interaction.reply({
        content: '❌ Cannot grant SnapSmith to a bot.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await snapsmith.grantSnapSmith(targetUser.id, interaction.guild.id, targetMember);

    const color = result.success ? 0x2ecc71 : 0xe74c3c;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🔧 SnapSmith Grant')
      .setDescription(result.message);

    if (result.success && result.expiresAt) {
      embed.addFields({
        name: 'Expires',
        value: `<t:${Math.floor(result.expiresAt.getTime() / 1000)}:D>`
      });
    }

    await interaction.editReply({ embeds: [embed] });

    logger.info(`[SNAPSMITH] Grant command: ${interaction.user.tag} granted to ${targetUser.tag}`);
  },
};

// ─── /snapsmith remove <user> (Ripperdoc+ only) ────────────────────────────────

const removeCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-remove')
    .setDescription('Manually remove SnapSmith role from a user (Ripperdoc+ only)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to remove role from').setRequired(true)
    ),

  async execute(interaction) {
    if (!isRipperdocPlus(interaction.member)) {
      return interaction.reply({
        content: '❌ Only Ripperdocs+ can use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({
        content: '❌ Member not found in this server.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await snapsmith.removeSnapSmith(targetUser.id, interaction.guild.id, targetMember);

    const color = result.success ? 0x2ecc71 : 0xe74c3c;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🔧 SnapSmith Removal')
      .setDescription(result.message);

    await interaction.editReply({ embeds: [embed] });

    logger.info(`[SNAPSMITH] Remove command: ${interaction.user.tag} removed from ${targetUser.tag}`);
  },
};

// ─── /snapsmith ban/unban <user> (Ripperdoc+ only) ──────────────────────────────

const banCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-ban')
    .setDescription('Ban a user from receiving SnapSmith role (Ripperdoc+ only)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to ban').setRequired(true)
    ),

  async execute(interaction) {
    if (!isRipperdocPlus(interaction.member)) {
      return interaction.reply({
        content: '❌ Only Ripperdocs+ can use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    const targetUser = interaction.options.getUser('user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await snapsmith.banUser(targetUser.id, interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🔧 SnapSmith Ban')
      .setDescription(`✅ <@${targetUser.id}> has been **banned** from receiving the SnapSmith role.`);

    await interaction.editReply({ embeds: [embed] });

    logger.info(`[SNAPSMITH] Ban command: ${interaction.user.tag} banned ${targetUser.tag}`);
  },
};

const unbanCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-unban')
    .setDescription('Unban a user from receiving SnapSmith role (Ripperdoc+ only)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to unban').setRequired(true)
    ),

  async execute(interaction) {
    if (!isRipperdocPlus(interaction.member)) {
      return interaction.reply({
        content: '❌ Only Ripperdocs+ can use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    const targetUser = interaction.options.getUser('user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await snapsmith.unbanUser(targetUser.id, interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🔧 SnapSmith Unban')
      .setDescription(`✅ <@${targetUser.id}> has been **unbanned** from receiving the SnapSmith role.`);

    await interaction.editReply({ embeds: [embed] });

    logger.info(`[SNAPSMITH] Unban command: ${interaction.user.tag} unbanned ${targetUser.tag}`);
  },
};

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = [checkCommand, grantCommand, removeCommand, banCommand, unbanCommand];
