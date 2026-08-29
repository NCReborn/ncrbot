const { EmbedBuilder } = require('discord.js');
const { AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Increased window to avoid missing human deletions
const AUDIT_LOG_TIME_WINDOW_MS = 15000; // 15 seconds

// Helper function to format user tag in Discord.js v14 compatible way
function formatUserTag(user) {
  if (!user) return 'Unknown User';
  if (user.discriminator && user.discriminator !== '0') {
    return `${user.username}#${user.discriminator}`;
  }
  return user.username || user.tag || 'Unknown User';
}

const DEFAULT_EVENTS = {
  guildBanAdd: { enabled: true, name: 'Member Banned', color: 16729943, emoji: '🔨' },
  guildBanRemove: { enabled: true, name: 'Member Unbanned', color: 3069299, emoji: '🔓' },
  guildMemberAdd: { enabled: true, name: 'Member Joined', color: 3069299, emoji: '📥' },
  guildMemberRemove: { enabled: true, name: 'Member Left/Kicked', color: 16742273, emoji: '📤' },
  guildMemberUpdate: { enabled: true, name: 'Member Updated', color: 3622906, emoji: '✏️' },
  messageDelete: { enabled: true, name: 'Message Deleted', color: 16729943, emoji: '🗑️' },
  messageUpdate: { enabled: true, name: 'Message Edited', color: 16752451, emoji: '✏️' },
  channelCreate: { enabled: true, name: 'Channel Created', color: 3069299, emoji: '📝' },
  channelDelete: { enabled: true, name: 'Channel Deleted', color: 16729943, emoji: '🗑️' },
  channelUpdate: { enabled: true, name: 'Channel Updated', color: 3622906, emoji: '✏️' },
  threadCreate: { enabled: true, name: 'Thread Created', color: 3069299, emoji: '🧵' },
  threadDelete: { enabled: true, name: 'Thread Deleted', color: 16729943, emoji: '🗑️' },
  threadUpdate: { enabled: true, name: 'Thread Updated', color: 3622906, emoji: '✏️' },
  guildMemberTimeout: { enabled: true, name: 'Member Timeout', color: 16752451, emoji: '⏰' }
};

class AuditLogger {
  constructor() {
    this.configPath = path.join(__dirname, '..', 'config', 'auditConfig.json');
    this.config = this.loadConfig();
  }

  cloneDefaultEvents() {
    return JSON.parse(JSON.stringify(DEFAULT_EVENTS));
  }

  normalizeEvents(events = {}) {
    const normalizedEvents = this.cloneDefaultEvents();

    for (const [eventName, eventConfig] of Object.entries(events)) {
      if (!normalizedEvents[eventName]) continue;
      normalizedEvents[eventName] = {
        ...normalizedEvents[eventName],
        ...eventConfig
      };
    }

    return normalizedEvents;
  }

  normalizeConfig(rawConfig = {}) {
    const guildConfigs = rawConfig.guildConfigs || {};
    const normalizedGuildConfigs = {};

    for (const [guildId, guildConfig] of Object.entries(guildConfigs)) {
      normalizedGuildConfigs[guildId] = {
        auditChannelId: guildConfig?.auditChannelId || null,
        events: this.normalizeEvents(guildConfig?.events || {})
      };
    }

    return { guildConfigs: normalizedGuildConfigs };
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return this.normalizeConfig(JSON.parse(data));
    } catch (error) {
      logger.error('Failed to load audit config:', error);
      return { guildConfigs: {} };
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      logger.error('Failed to save audit config:', error);
    }
  }

  ensureGuildConfig(guildId, persist = false) {
    if (!guildId) return null;

    if (!this.config.guildConfigs[guildId]) {
      this.config.guildConfigs[guildId] = {
        auditChannelId: null,
        events: this.cloneDefaultEvents()
      };
      if (persist) {
        this.saveConfig();
      }
    }

    return this.config.guildConfigs[guildId];
  }

  getGuildConfig(guildId) {
    if (!guildId) return null;
    return this.config.guildConfigs[guildId] || null;
  }

  isEventEnabled(guildId, eventName) {
    const guildConfig = this.getGuildConfig(guildId);
    return guildConfig?.events?.[eventName]?.enabled || false;
  }

  toggleEvent(guildId, eventName, enabled) {
    const guildConfig = this.ensureGuildConfig(guildId);
    if (!guildConfig?.events?.[eventName]) return false;

    guildConfig.events[eventName].enabled = enabled;
    this.saveConfig();
    return true;
  }

  setAuditChannel(guildId, channelId) {
    const guildConfig = this.ensureGuildConfig(guildId);
    if (!guildConfig) return;

    guildConfig.auditChannelId = channelId;
    this.saveConfig();
  }

  getAuditChannel(guildId) {
    const guildConfig = this.getGuildConfig(guildId);
    return guildConfig?.auditChannelId || null;
  }

  getEventConfig(guildId, eventName) {
    const guildConfig = this.getGuildConfig(guildId);
    return guildConfig?.events?.[eventName] || null;
  }

  getAllEvents(guildId) {
    const guildConfig = this.getGuildConfig(guildId);
    return guildConfig?.events || null;
  }

  async resolveAuditChannel(client, guildId) {
    const configuredChannelId = this.getAuditChannel(guildId);
    if (!configuredChannelId) return null;

    const cachedChannel = client.channels?.cache?.get(configuredChannelId);
    const channel = cachedChannel || await client.channels.fetch(configuredChannelId, { force: false }).catch(() => null);
    if (!channel) {
      logger.warn(`Audit channel ${configuredChannelId} not found for guild ${guildId}`);
      return null;
    }

    if (channel.guildId !== guildId) {
      logger.warn(`Audit channel ${configuredChannelId} does not belong to guild ${guildId}. Skipping audit log.`);
      return null;
    }

    return channel;
  }

  createBaseEmbed(eventName, user, guild) {
    if (!guild?.id) return null;

    const eventConfig = this.getEventConfig(guild.id, eventName);
    if (!eventConfig) return null;

    const embed = new EmbedBuilder()
      .setColor(eventConfig.color)
      .setTitle(`${eventConfig.emoji} ${eventConfig.name}`)
      .setTimestamp()
      .setFooter({
        text: `ID: ${user?.id || 'Unknown'} • ${guild?.name || 'Unknown Guild'} (${guild.id})`,
        iconURL: guild?.iconURL() || null
      });

    if (user) {
      embed.setAuthor({
        name: `${user.tag || user.username || 'Unknown User'}`,
        iconURL: user.displayAvatarURL({ dynamic: true, size: 256 }) || null
      });
    }

    return embed;
  }

  async sendAuditLog(client, eventName, embed, guild) {
    const guildId = guild?.id;
    if (!guildId || !this.isEventEnabled(guildId, eventName)) return;

    try {
      const channel = await this.resolveAuditChannel(client, guildId);
      if (!channel) return;

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error(`Failed to send audit log for ${eventName}:`, error);
    }
  }

  // ============================
  // MEMBER BAN / UNBAN
  // ============================

  async logMemberBanned(client, ban) {
    const embed = this.createBaseEmbed('guildBanAdd', ban.user, ban.guild);
    if (!embed) return;

    let executor = 'Unknown';
    let reason = 'No reason provided';

    try {
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 5
      });

      const auditEntry = auditLogs.entries.find(entry =>
        entry.target.id === ban.user.id &&
        Date.now() - entry.createdTimestamp < AUDIT_LOG_TIME_WINDOW_MS
      );

      if (auditEntry) {
        executor = `${formatUserTag(auditEntry.executor)} (${auditEntry.executor.id})`;
        reason = auditEntry.reason || 'No reason provided';
      }
    } catch (error) {
      logger.error('Failed to fetch audit logs for ban:', error);
      executor = 'Unknown (bot needs View Audit Log permission)';
    }

    embed.addFields([
      { name: 'User', value: `${formatUserTag(ban.user)} (${ban.user.id})`, inline: true },
      { name: 'Banned By', value: executor, inline: true },
      { name: 'Reason', value: reason, inline: false }
    ]);

    await this.sendAuditLog(client, 'guildBanAdd', embed, ban.guild);
  }

  async logMemberUnbanned(client, ban) {
    const embed = this.createBaseEmbed('guildBanRemove', ban.user, ban.guild);
    if (!embed) return;

    let executor = 'Unknown';
    let reason = 'No reason provided';

    try {
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanRemove,
        limit: 5
      });

      const auditEntry = auditLogs.entries.find(entry =>
        entry.target.id === ban.user.id &&
        Date.now() - entry.createdTimestamp < AUDIT_LOG_TIME_WINDOW_MS
      );

      if (auditEntry) {
        executor = `${formatUserTag(auditEntry.executor)} (${auditEntry.executor.id})`;
        reason = auditEntry.reason || 'No reason provided';
      }
    } catch (error) {
      logger.error('Failed to fetch audit logs for unban:', error);
      executor = 'Unknown (bot needs View Audit Log permission)';
    }

    embed.addFields([
      { name: 'User', value: `${formatUserTag(ban.user)} (${ban.user.id})`, inline: true },
      { name: 'Unbanned By', value: executor, inline: true },
      { name: 'Reason', value: reason, inline: false }
    ]);

    await this.sendAuditLog(client, 'guildBanRemove', embed, ban.guild);
  }

  // ============================
  // MEMBER JOIN / LEAVE
  // ============================

  async logMemberJoined(client, member) {
    const embed = this.createBaseEmbed('guildMemberAdd', member.user, member.guild);
    if (!embed) return;

    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));

    embed.addFields([
      { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R> (${accountAge} days ago)`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    ]);

    await this.sendAuditLog(client, 'guildMemberAdd', embed, member.guild);
  }

  async logMemberLeft(client, member) {
    const embed = this.createBaseEmbed('guildMemberRemove', member.user, member.guild);
    if (!embed) return;

    const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

    let executor = null;
    let reason = null;
    let wasKicked = false;

    try {
      const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 5
      });

      const kickEntry = auditLogs.entries.find(entry =>
        entry.target.id === member.user.id &&
        Date.now() - entry.createdTimestamp < AUDIT_LOG_TIME_WINDOW_MS
      );

      if (kickEntry) {
        wasKicked = true;
        executor = `${formatUserTag(kickEntry.executor)} (${kickEntry.executor.id})`;
        reason = kickEntry.reason || 'No reason provided';
      }
    } catch (error) {
      logger.error('Failed to fetch audit logs for member leave:', error);
    }

    embed.addFields([
      { name: 'User', value: `${formatUserTag(member.user)} (${member.user.id})`, inline: true },
      { name: 'Joined', value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : 'Unknown', inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    ]);

    if (wasKicked && executor) {
      embed.addFields([
        { name: 'Kicked By', value: executor, inline: true },
        { name: 'Reason', value: reason, inline: false }
      ]);
    }

    if (member.roles.cache.size > 1) {
      const roles = member.roles.cache
        .filter(role => role.id !== member.guild.id)
        .map(role => role.toString())
        .slice(0, 10);
      if (roles.length > 0) {
        embed.addFields([
          { name: 'Roles', value: roles.join(', '), inline: false }
        ]);
      }
    }

    await this.sendAuditLog(client, 'guildMemberRemove', embed, member.guild);
  }

  // ============================
  // MEMBER UPDATE (roles, timeout)
  // ============================

  async logMemberUpdate(client, oldMember, newMember) {
    const embed = this.createBaseEmbed('guildMemberUpdate', newMember.user, newMember.guild);
    if (!embed) return;

    const changes = [];

    // Nickname
    if (oldMember.nickname !== newMember.nickname) {
      changes.push({
        name: 'Nickname',
        value: `${oldMember.nickname || 'None'} → ${newMember.nickname || 'None'}`,
        inline: true
      });
    }

    // Timeout changes
    if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {

      // Prevent stale timeout spam
      if (newMember.communicationDisabledUntil) {
        const TIMEOUT_MAX_AGE_MS = 10 * 60 * 1000;
        const timeoutAge = Date.now() - newMember.communicationDisabledUntil.getTime();
        if (timeoutAge > TIMEOUT_MAX_AGE_MS) return;
      }

      if (newMember.communicationDisabledUntil) {
        const timeoutUntil = Math.floor(newMember.communicationDisabledUntil.getTime() / 1000);
        changes.push({
          name: 'Timeout Applied',
          value: `Until <t:${timeoutUntil}:F> (<t:${timeoutUntil}:R>)`,
          inline: true
        });

        const timeoutEmbed = this.createBaseEmbed('guildMemberTimeout', newMember.user, newMember.guild);
        if (timeoutEmbed) {
          let executor = 'Unknown';
          let reason = 'No reason provided';

          try {
            const auditLogs = await newMember.guild.fetchAuditLogs({
              type: AuditLogEvent.MemberUpdate,
              limit: 5
            });

            const timeoutEntry = auditLogs.entries.find(entry =>
              entry.target.id === newMember.user.id &&
              Date.now() - entry.createdTimestamp < AUDIT_LOG_TIME_WINDOW_MS &&
              entry.changes?.some(change => change.key === 'communication_disabled_until')
            );

            if (timeoutEntry) {
              executor = `${formatUserTag(timeoutEntry.executor)} (${timeoutEntry.executor.id})`;
              reason = timeoutEntry.reason || 'No reason provided';
            }
          } catch (error) {
            logger.error('Failed to fetch audit logs for timeout:', error);
            executor = 'Unknown (bot needs View Audit Log permission)';
          }

          timeoutEmbed.addFields([
            { name: 'User', value: `${formatUserTag(newMember.user)} (${newMember.user.id})`, inline: true },
            { name: 'Timed Out By', value: executor, inline: true },
            { name: 'Timeout Until', value: `<t:${timeoutUntil}:F> (<t:${timeoutUntil}:R>)`, inline: false },
            { name: 'Reason', value: reason, inline: false }
          ]);

          await this.sendAuditLog(client, 'guildMemberTimeout', timeoutEmbed, newMember.guild);
        }
      } else if (oldMember.communicationDisabledUntil) {
        changes.push({
          name: 'Timeout Removed',
          value: 'User can now communicate again',
          inline: true
        });
      }
    }

    // Role changes
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

    if (addedRoles.size > 0) {
      changes.push({
        name: 'Roles Added',
        value: addedRoles.map(role => role.toString()).join(', '),
        inline: true
      });
    }

    if (removedRoles.size > 0) {
      changes.push({
        name: 'Roles Removed',
        value: removedRoles.map(role => role.toString()).join(', '),
        inline: true
      });
    }

    if (changes.length === 0) return;

    embed.addFields([
      { name: 'User', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
      ...changes
    ]);

    await this.sendAuditLog(client, 'guildMemberUpdate', embed, newMember.guild);
  }

  // ============================
  // MESSAGE DELETE (patched)
  // ============================

  async logMessageDeleted(client, message, executorOverride = null) {
    if (!message.guild?.id) return;
    if (message.channelId === this.getAuditChannel(message.guild.id)) return;

    const embed = this.createBaseEmbed('messageDelete', message.author, message.guild);
    if (!embed) return;

    let deletedBy = 'Unknown';

    if (executorOverride) {
      deletedBy = executorOverride;
    } else {
      try {
        const auditLogs = await message.guild.fetchAuditLogs({
          type: AuditLogEvent.MessageDelete,
          limit: 5
        });

        const deleteLog = auditLogs.entries.find(entry =>
          entry.target?.id === message.author.id &&
          entry.extra?.channel?.id === message.channelId &&
          entry.createdTimestamp > Date.now() - AUDIT_LOG_TIME_WINDOW_MS
        );

        if (deleteLog) {
          deletedBy = `${deleteLog.executor.tag} (${deleteLog.executor.id})`;
        } else {
          const bulkLog = auditLogs.entries.find(entry =>
            entry.action === AuditLogEvent.MessageBulkDelete &&
            entry.extra?.channel?.id === message.channelId &&
            entry.createdTimestamp > Date.now() - AUDIT_LOG_TIME_WINDOW_MS
          );

          if (bulkLog) {
            deletedBy = `${bulkLog.executor.tag} (${bulkLog.executor.id}) [Bulk Delete]`;
          } else {
            deletedBy = 'User (self-deleted)';
          }
        }
      } catch (error) {
        deletedBy = 'Unknown (bot needs View Audit Log permission)';
        logger.error('Failed to fetch audit logs for message deletion:', error);
      }
    }

    embed.addFields([
      { name: 'Author', value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: 'Deleted By', value: deletedBy, inline: true },
      { name: 'Channel', value: `${message.channel.toString()} (#${message.channel.name})`, inline: true },
      { name: 'Message ID', value: message.id, inline: true }
    ]);

    if (message.content && message.content.length > 0) {
      const content = message.content.length > 1024
        ? message.content.substring(0, 1021) + '...'
        : message.content;

      embed.addFields([{ name: 'Content', value: content, inline: false }]);
    }

    if (message.attachments.size > 0) {
      const attachments = message.attachments.map(att => att.name).join(', ');
      embed.addFields([{ name: 'Attachments', value: attachments, inline: false }]);
    }

    await this.sendAuditLog(client, 'messageDelete', embed, message.guild);
  }

  // ============================
  // MESSAGE UPDATE
  // ============================

  async logMessageUpdated(client, oldMessage, newMessage) {
    if (newMessage.author?.bot || oldMessage.content === newMessage.content) return;
    if (!newMessage.guild?.id) return;
    if (newMessage.channelId === this.getAuditChannel(newMessage.guild.id)) return;

    const embed = this.createBaseEmbed('messageUpdate', newMessage.author, newMessage.guild);
    if (!embed) return;

    embed.addFields([
      { name: 'User', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
      { name: 'Channel', value: `${newMessage.channel.toString()} (#${newMessage.channel.name})`, inline: true },
      { name: 'Message', value: `[Jump to Message](${newMessage.url})`, inline: true }
    ]);

    if (oldMessage.content) {
      const oldContent = oldMessage.content.length > 512
        ? oldMessage.content.substring(0, 509) + '...'
        : oldMessage.content;
      embed.addFields([{ name: 'Before', value: oldContent || 'No content', inline: false }]);
    }

    if (newMessage.content) {
      const newContent = newMessage.content.length > 512
        ? newMessage.content.substring(0, 509) + '...'
        : newMessage.content;
      embed.addFields([{ name: 'After', value: newContent || 'No content', inline: false }]);
    }

    await this.sendAuditLog(client, 'messageUpdate', embed, newMessage.guild);
  }

  // ============================
  // CHANNEL CREATE / DELETE / UPDATE
  // ============================

  async logChannelCreated(client, channel) {
    const embed = this.createBaseEmbed('channelCreate', null, channel.guild);
    if (!embed) return;

    embed.setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() || null });
    embed.addFields([
      { name: 'Channel', value: `${channel.toString()} (#${channel.name})`, inline: true },
      { name: 'Type', value: channel.type.toString(), inline: true },
      { name: 'ID', value: channel.id, inline: true }
    ]);

    if (channel.parent) {
      embed.addFields([{ name: 'Category', value: channel.parent.name, inline: true }]);
    }

    await this.sendAuditLog(client, 'channelCreate', embed, channel.guild);
  }

  async logChannelDeleted(client, channel) {
    const embed = this.createBaseEmbed('channelDelete', null, channel.guild);
    if (!embed) return;

    embed.setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() || null });
    embed.addFields([
      { name: 'Channel', value: `#${channel.name}`, inline: true },
      { name: 'Type', value: channel.type.toString(), inline: true },
      { name: 'ID', value: channel.id, inline: true }
    ]);

    if (channel.parent) {
      embed.addFields([{ name: 'Category', value: channel.parent.name, inline: true }]);
    }

    await this.sendAuditLog(client, 'channelDelete', embed, channel.guild);
  }

  async logChannelUpdated(client, oldChannel, newChannel) {
    const embed = this.createBaseEmbed('channelUpdate', null, newChannel.guild);
    if (!embed) return;

    const changes = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push({
        name: 'Name',
        value: `${oldChannel.name} → ${newChannel.name}`,
        inline: true
      });
    }

    if (oldChannel.topic !== newChannel.topic) {
      changes.push({
        name: 'Topic',
        value: `${oldChannel.topic || 'None'} → ${newChannel.topic || 'None'}`,
        inline: true
      });
    }

    if (changes.length === 0) return;

    embed.setAuthor({ name: newChannel.guild.name, iconURL: newChannel.guild.iconURL() || null });
    embed.addFields([
      { name: 'Channel', value: `${newChannel.toString()} (#${newChannel.name})`, inline: true },
      ...changes
    ]);

    await this.sendAuditLog(client, 'channelUpdate', embed, newChannel.guild);
  }

  // ============================
  // THREAD CREATE / DELETE / UPDATE
  // ============================

  async logThreadCreated(client, thread) {
    const owner = thread.ownerId
      ? await thread.guild.members.fetch(thread.ownerId).catch(() => ({ user: { id: thread.ownerId } }))
      : null;

    const embed = this.createBaseEmbed('threadCreate', owner?.user, thread.guild);
    if (!embed) return;

    embed.addFields([
      { name: 'Thread', value: `${thread.toString()} (${thread.name})`, inline: true },
      { name: 'Parent Channel', value: `${thread.parent.toString()} (#${thread.parent.name})`, inline: true },
      { name: 'ID', value: thread.id, inline: true }
    ]);

    if (owner?.user) {
      embed.addFields([
        { name: 'Created by', value: `${owner.user.tag} (${owner.user.id})`, inline: true }
      ]);
    }

    await this.sendAuditLog(client, 'threadCreate', embed, thread.guild);
  }

  async logThreadDeleted(client, thread) {
    const owner = thread.ownerId
      ? await thread.guild.members.fetch(thread.ownerId).catch(() => ({ user: { id: thread.ownerId } }))
      : null;

    const embed = this.createBaseEmbed('threadDelete', owner?.user, thread.guild);
    if (!embed) return;

    embed.addFields([
      { name: 'Thread', value: thread.name, inline: true },
      { name: 'Parent Channel', value: thread.parent ? `#${thread.parent.name}` : 'Unknown', inline: true },
      { name: 'ID', value: thread.id, inline: true }
    ]);

    if (owner?.user) {
      embed.addFields([
        { name: 'Owned by', value: `${owner.user.tag} (${owner.user.id})`, inline: true }
      ]);
    }

    await this.sendAuditLog(client, 'threadDelete', embed, thread.guild);
  }

  async logThreadUpdated(client, oldThread, newThread) {
    const owner = newThread.ownerId
      ? await newThread.guild.members.fetch(newThread.ownerId).catch(() => ({ user: { id: newThread.ownerId } }))
      : null;

    const embed = this.createBaseEmbed('threadUpdate', owner?.user, newThread.guild);
    if (!embed) return;

    const changes = [];

    if (oldThread.name !== newThread.name) {
      changes.push({
        name: 'Name',
        value: `${oldThread.name} → ${newThread.name}`,
        inline: true
      });
    }

    if (oldThread.archived !== newThread.archived) {
      changes.push({
        name: 'Archived',
        value: `${oldThread.archived} → ${newThread.archived}`,
        inline: true
      });
    }

    if (oldThread.locked !== newThread.locked) {
      changes.push({
        name: 'Locked',
        value: `${oldThread.locked} → ${newThread.locked}`,
        inline: true
      });
    }

    if (changes.length === 0) return;

    embed.addFields([
      { name: 'Thread', value: `${newThread.toString()} (${newThread.name})`, inline: true },
      ...changes
    ]);

    await this.sendAuditLog(client, 'threadUpdate', embed, newThread.guild);
  }
}

module.exports = new AuditLogger();
