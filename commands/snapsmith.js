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

// ─── Helper: Post announcement ─────────────────────────────────────────────────

async function postSnapSmithAnnouncement(guild, userId, displayName, expiresAt) {
  try {
    const channel = guild.channels.cache.get(CONSTANTS.CHANNELS.SNAPSMITH_ANNOUNCEMENTS);
    if (!channel) {
      logger.warn(`[SNAPSMITH] Announcement channel not found: ${CONSTANTS.CHANNELS.SNAPSMITH_ANNOUNCEMENTS}`);
      return;
    }

    const expiryDate = new Date(expiresAt);
    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('🔧 New SnapSmith!')
      .setDescription(`Congratulations to <@${userId}> for becoming a **SnapSmith**! 🎉\n\nKeep showcasing your best work to maintain your status.`)
      .addFields(
        { name: 'Member', value: displayName, inline: true },
        { name: 'Expires', value: `<t:${Math.floor(expiryDate.getTime() / 1000)}:D>`, inline: true },
        { name: 'Duration', value: `${snapsmith.GRANT_DURATION_DAYS} days`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    logger.info(`[SNAPSMITH] Announcement posted for ${userId}`);
  } catch (err) {
    logger.error(`[SNAPSMITH] Failed to post announcement: ${err.message}`);
  }
}

// ─── /snapsmith (check status) - PUBLIC ────────────────────────────────────────

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

// ─── /snapsmith-grant <user> (Ripperdoc+ only) ─────────────────────────────────

const grantCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-grant')
    .setDescription('Grant SnapSmith role to a user (Ripperdoc+ only)')
    .setDefaultMemberPermissions(0) // Hide from non-admins
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

      // Post announcement
      await postSnapSmithAnnouncement(
        interaction.guild,
        targetUser.id,
        targetMember.displayName,
        result.expiresAt
      );
    }

    await interaction.editReply({ embeds: [embed] });

    logger.info(`[SNAPSMITH] Grant command: ${interaction.user.tag} granted to ${targetUser.tag}`);
  },
};

// ─── /snapsmith-remove <user> (Ripperdoc+ only) ────────────────────────────────

const removeCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-remove')
    .setDescription('Manually remove SnapSmith role from a user (Ripperdoc+ only)')
    .setDefaultMemberPermissions(0) // Hide from non-admins
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

// ─── /snapsmith-ban <user> (Ripperdoc+ only) ──────────────────────────────────

const banCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-ban')
    .setDescription('Ban a user from receiving SnapSmith role (Ripperdoc+ only)')
    .setDefaultMemberPermissions(0) // Hide from non-admins
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

// ─── /snapsmith-unban <user> (Ripperdoc+ only) ─────────────────────────────────

const unbanCommand = {
  data: new SlashCommandBuilder()
    .setName('snapsmith-unban')
    .setDescription('Unban a user from receiving SnapSmith role (Ripperdoc+ only)')
    .setDefaultMemberPermissions(0) // Hide from non-admins
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
