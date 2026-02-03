const { EmbedBuilder } = require('discord.js');
const { AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const AUDIT_LOG_TIME_WINDOW_MS = 5000; // 5 seconds

class AuditLogger {
  constructor() {
    this.configPath = path.join(__dirname, '..', 'config', 'auditConfig.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load audit config:', error);
      return { auditChannelId: null, events: {} };
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      logger.error('Failed to save audit config:', error);
    }
  }

  isEventEnabled(eventName) {
    return this.config.events[eventName]?.enabled || false;
  }

  toggleEvent(eventName, enabled) {
    if (this.config.events[eventName]) {
      this.config.events[eventName].enabled = enabled;
      this.saveConfig();
      return true;
    }
    return false;
  }

  setAuditChannel(channelId) {
    this.config.auditChannelId = channelId;
    this.saveConfig();
  }

  getAuditChannel() {
    return this.config.auditChannelId;
  }

  getEventConfig(eventName) {
    return this.config.events[eventName] || null;
  }

  getAllEvents() {
    return this.config.events;
  }

  createBaseEmbed(eventName, user, guild) {
    const eventConfig = this.getEventConfig(eventName);
    if (!eventConfig) return null;

    const embed = new EmbedBuilder()
      .setColor(eventConfig.color)
      .setTitle(`${eventConfig.emoji} ${eventConfig.name}`)
      .setTimestamp()
      .setFooter({ 
        text: `ID: ${user?.id || 'Unknown'} • ${guild?.name || 'Unknown Guild'}`,
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

  async sendAuditLog(client, eventName, embed) {
    if (!this.isEventEnabled(eventName)) return;
    
    const channelId = this.getAuditChannel();
    if (!channelId) return;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        logger.warn(`Audit channel ${channelId} not found`);
        return;
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error(`Failed to send audit log for ${eventName}:`, error);
    }
  }

  // Specific log methods for different events
  async logMemberBanned(client, ban) {
    const embed = this.createBaseEmbed('guildBanAdd', ban.user, ban.guild);
    if (!embed) return;

    embed.addFields([
      { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
      { name: 'Reason', value: ban.reason || 'No reason provided', inline: true }
    ]);

    await this.sendAuditLog(client, 'guildBanAdd', embed);
  }

  async logMemberUnbanned(client, ban) {
    const embed = this.createBaseEmbed('guildBanRemove', ban.user, ban.guild);
    if (!embed) return;

    embed.addFields([
      { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true }
    ]);

    await this.sendAuditLog(client, 'guildBanRemove', embed);
  }

  async logMemberJoined(client, member) {
    const embed = this.createBaseEmbed('guildMemberAdd', member.user, member.guild);
    if (!embed) return;

    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
    
    embed.addFields([
      { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R> (${accountAge} days ago)`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    ]);

    await this.sendAuditLog(client, 'guildMemberAdd', embed);
  }

  async logMemberLeft(client, member) {
    const embed = this.createBaseEmbed('guildMemberRemove', member.user, member.guild);
    if (!embed) return;

    const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    
    embed.addFields([
      { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
      { name: 'Joined', value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : 'Unknown', inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    ]);

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

    await this.sendAuditLog(client, 'guildMemberRemove', embed);
  }

  async logMemberUpdate(client, oldMember, newMember) {
    const embed = this.createBaseEmbed('guildMemberUpdate', newMember.user, newMember.guild);
    if (!embed) return;

    const changes = [];

    // Check nickname changes
    if (oldMember.nickname !== newMember.nickname) {
      changes.push({
        name: 'Nickname',
        value: `${oldMember.nickname || 'None'} → ${newMember.nickname || 'None'}`,
        inline: true
      });
    }

    // Check timeout changes
    if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
      if (newMember.communicationDisabledUntil) {
        const timeoutUntil = Math.floor(newMember.communicationDisabledUntil.getTime() / 1000);
        changes.push({
          name: 'Timeout Applied',
          value: `Until <t:${timeoutUntil}:F> (<t:${timeoutUntil}:R>)`,
          inline: true
        });
        // Use timeout-specific event for this
        const timeoutEmbed = this.createBaseEmbed('guildMemberTimeout', newMember.user, newMember.guild);
        if (timeoutEmbed) {
          timeoutEmbed.addFields([
            { name: 'User', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
            { name: 'Timeout Until', value: `<t:${timeoutUntil}:F> (<t:${timeoutUntil}:R>)`, inline: true }
          ]);
          await this.sendAuditLog(client, 'guildMemberTimeout', timeoutEmbed);
        }
      } else if (oldMember.communicationDisabledUntil) {
        changes.push({
          name: 'Timeout Removed',
          value: 'User can now communicate again',
          inline: true
        });
      }
    }

    // Check role changes
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

    if (changes.length === 0) return; // No relevant changes

    embed.addFields([
      { name: 'User', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
      ...changes
    ]);

    await this.sendAuditLog(client, 'guildMemberUpdate', embed);
  }

  async logMessageDeleted(client, message) {
    // Skip if this is the audit channel to prevent loops
    if (message.channelId === this.getAuditChannel()) return;
    
    const embed = this.createBaseEmbed('messageDelete', message.author, message.guild);
    if (!embed) return;

    // Fetch who deleted the message from audit logs
    let deletedBy = 'Unknown';
    try {
      const auditLogs = await message.guild.fetchAuditLogs({
        type: AuditLogEvent.MessageDelete,
        limit: 5
      });
      
      const deleteLog = auditLogs.entries.find(entry => 
        entry.target?.id === message.author.id &&
        entry.createdTimestamp > Date.now() - AUDIT_LOG_TIME_WINDOW_MS &&
        entry.extra?.channel?.id === message.channelId
      );
      
      if (deleteLog) {
        deletedBy = `${deleteLog.executor.tag} (${deleteLog.executor.id})`;
      } else {
        // If no audit log entry found, likely self-deleted
        deletedBy = 'User (self-deleted)';
      }
    } catch (error) {
      deletedBy = 'Unknown (bot needs View Audit Log permission)';
      logger.error('Failed to fetch audit logs for message deletion:', error);
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
      embed.addFields([
        { name: 'Content', value: content, inline: false }
      ]);
    }

    if (message.attachments.size > 0) {
      const attachments = message.attachments.map(att => att.name).join(', ');
      embed.addFields([
        { name: 'Attachments', value: attachments, inline: false }
      ]);
    }

    await this.sendAuditLog(client, 'messageDelete', embed);
  }

  async logMessageUpdated(client, oldMessage, newMessage) {
    // Skip bot messages and messages without content changes
    if (newMessage.author?.bot || oldMessage.content === newMessage.content) return;
    
    // Skip if this is the audit channel to prevent loops
    if (newMessage.channelId === this.getAuditChannel()) return;

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
      embed.addFields([
        { name: 'Before', value: oldContent || 'No content', inline: false }
      ]);
    }

    if (newMessage.content) {
      const newContent = newMessage.content.length > 512 
        ? newMessage.content.substring(0, 509) + '...' 
        : newMessage.content;
      embed.addFields([
        { name: 'After', value: newContent || 'No content', inline: false }
      ]);
    }

    await this.sendAuditLog(client, 'messageUpdate', embed);
  }

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
      embed.addFields([
        { name: 'Category', value: channel.parent.name, inline: true }
      ]);
    }

    await this.sendAuditLog(client, 'channelCreate', embed);
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
      embed.addFields([
        { name: 'Category', value: channel.parent.name, inline: true }
      ]);
    }

    await this.sendAuditLog(client, 'channelDelete', embed);
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

    await this.sendAuditLog(client, 'channelUpdate', embed);
  }

  async logThreadCreated(client, thread) {
    const owner = thread.ownerId ? await thread.guild.members.fetch(thread.ownerId).catch(() => ({ user: { id: thread.ownerId } })) : null;
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

    await this.sendAuditLog(client, 'threadCreate', embed);
  }

  async logThreadDeleted(client, thread) {
    const owner = thread.ownerId ? await thread.guild.members.fetch(thread.ownerId).catch(() => ({ user: { id: thread.ownerId } })) : null;
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

    await this.sendAuditLog(client, 'threadDelete', embed);
  }

  async logThreadUpdated(client, oldThread, newThread) {
    const owner = newThread.ownerId ? await newThread.guild.members.fetch(newThread.ownerId).catch(() => ({ user: { id: newThread.ownerId } })) : null;
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

    await this.sendAuditLog(client, 'threadUpdate', embed);
  }
}

module.exports = new AuditLogger();