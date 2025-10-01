const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const {
  SNAPSMITH_ROLE_ID,
  SNAPSMITH_CHANNEL_ID,
  SHOWCASE_CHANNEL_ID,
  ROLE_DURATION_DAYS,
  REACTION_TARGET,
  MAX_BUFFER_DAYS,
  syncCurrentSnapsmiths,
  evaluateRoles,
  scanShowcase
} = require('../utils/snapsmithManager');

const DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');
const REACTION_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmithreactions.json');

function loadData() {
  if (fs.existsSync(DATA_PATH)) {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
  return {};
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function loadReactions() {
  if (fs.existsSync(REACTION_DATA_PATH)) {
    return JSON.parse(fs.readFileSync(REACTION_DATA_PATH, 'utf8'));
  }
  return {};
}

function saveReactions(data) {
  fs.writeFileSync(REACTION_DATA_PATH, JSON.stringify(data, null, 2));
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ensureUserRecord(data, userId) {
  if (!data[userId]) {
    data[userId] = { months: {}, expiration: null, superApproved: false };
  }
  return data[userId];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snapsmithadmin')
    .setDescription('Admin tools for managing Snapsmith system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcmd =>
      subcmd.setName('addreaction')
        .setDescription('Manually add a unique user reaction to a showcase post')
        .addUserOption(opt => opt.setName('user').setDescription('User to add as reactor').setRequired(true))
        .addStringOption(opt => opt.setName('messageid').setDescription('Showcase message ID').setRequired(true))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('removereaction')
        .setDescription('Remove a unique user reaction from a showcase post')
        .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true))
        .addStringOption(opt => opt.setName('messageid').setDescription('Showcase message ID').setRequired(true))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('forcegive')
        .setDescription('Force give Snapsmith role to a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to give role').setRequired(true))
        .addIntegerOption(opt => opt.setName('days').setDescription('Number of days (default 30)').setRequired(false))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('forceremove')
        .setDescription('Force remove Snapsmith role from a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to remove role').setRequired(true))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('reset')
        .setDescription('Clear all reaction data for a user this month')
        .addUserOption(opt => opt.setName('user').setDescription('User to reset').setRequired(true))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('debug')
        .setDescription('Show stored data for a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to inspect').setRequired(true))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('forcesuper')
        .setDescription('Manually toggle super approval for a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to update').setRequired(true))
        .addBooleanOption(opt => opt.setName('remove').setDescription('Remove super approval?').setRequired(false))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('syncroles')
        .setDescription('Sync current Snapsmith role holders into the data store')
    )
    .addSubcommand(subcmd =>
      subcmd.setName('setexpiry')
        .setDescription('Set a custom expiration date for a user (UTC YYYY-MM-DD)')
        .addUserOption(opt => opt.setName('user').setDescription('User to update').setRequired(true))
        .addStringOption(opt => opt.setName('date').setDescription('YYYY-MM-DD').setRequired(true))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('purge')
        .setDescription('Purge reaction data older than N months')
        .addIntegerOption(opt => opt.setName('months').setDescription('Months to keep').setRequired(true))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('announce')
        .setDescription('Manually announce a Snapsmith winner')
        .addUserOption(opt => opt.setName('user').setDescription('Winner to announce').setRequired(true))
        .addIntegerOption(opt => opt.setName('days').setDescription('Days awarded').setRequired(true))
        .addIntegerOption(opt => opt.setName('reactions').setDescription('Unique reactions (optional)').setRequired(false))
        .addBooleanOption(opt => opt.setName('superapproved').setDescription('Was Super Approved?').setRequired(false))
    )
    .addSubcommand(subcmd =>
      subcmd.setName('scan')
        .setDescription('Force a showcase scan (limited)')
        .addIntegerOption(opt => opt.setName('limit').setDescription('Number of messages to scan').setRequired(false))
        .addStringOption(opt => opt.setName('messageids').setDescription('Comma separated message IDs to scan').setRequired(false))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: 'You do not have permission to use this command.' });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const data = loadData();
    const reactions = loadReactions();
    const month = getCurrentMonth();
    let reply = 'No action taken.';

    try {
      if (sub === 'addreaction') {
        const reactor = interaction.options.getUser('user');
        const messageId = interaction.options.getString('messageid');
        const showcase = await interaction.client.channels.fetch(SHOWCASE_CHANNEL_ID);
        if (!showcase || !showcase.isTextBased()) {
          reply = 'Showcase channel not found or not text-based.';
        } else {
          try {
            const message = await showcase.messages.fetch(messageId);
            const ownerId = message.author.id;
            ensureUserRecord(data, ownerId);
            if (!reactions[ownerId]) reactions[ownerId] = {};
            if (!reactions[ownerId][month]) reactions[ownerId][month] = {};
            const current = new Set(reactions[ownerId][month][messageId] || []);
            current.add(reactor.id);
            reactions[ownerId][month][messageId] = Array.from(current);
            saveReactions(reactions);
            await evaluateRoles(interaction.client, data, reactions);
            reply = `Recorded ${formatUserTag(reactor)} as a unique reactor for message ${messageId}.`;
          } catch (err) {
            reply = `Could not fetch message ${messageId}: ${err.message}`;
          }
        }
      } else if (sub === 'removereaction') {
        const reactor = interaction.options.getUser('user');
        const messageId = interaction.options.getString('messageid');
        let removed = false;
        for (const [ownerId, months] of Object.entries(reactions)) {
          if (months[month] && months[month][messageId]) {
            const filtered = months[month][messageId].filter(id => id !== reactor.id);
            if (filtered.length !== months[month][messageId].length) {
              months[month][messageId] = filtered;
              if (filtered.length === 0) {
                delete months[month][messageId];
              }
              if (Object.keys(months[month]).length === 0) {
                delete months[month];
              }
              removed = true;
            }
          }
          if (Object.keys(months).length === 0) {
            delete reactions[ownerId];
          }
        }
        if (removed) {
          saveReactions(reactions);
          await evaluateRoles(interaction.client, data, reactions);
          reply = `Removed ${formatUserTag(reactor)} from message ${messageId}.`;
        } else {
          reply = 'No matching reaction entry found.';
        }
      } else if (sub === 'forcegive') {
        const target = interaction.options.getUser('user');
        const days = interaction.options.getInteger('days') || ROLE_DURATION_DAYS;
        const now = new Date();
        const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const record = ensureUserRecord(data, target.id);
        record.expiration = expires.toISOString();
        record.superApproved = record.superApproved || false;
        saveData(data);
        try {
          const member = await interaction.guild.members.fetch(target.id);
          await member.roles.add(SNAPSMITH_ROLE_ID);
        } catch (err) {
          logger.warn(`Failed to add Snapsmith role for ${target.id}: ${err.message}`);
        }
        try {
          const channel = await interaction.client.channels.fetch(SNAPSMITH_CHANNEL_ID);
          if (channel && channel.isTextBased()) {
            await channel.send(`<@${target.id}> has been manually awarded Snapsmith for ${days} day(s).`);
          }
        } catch (err) {
          logger.warn(`Failed to announce manual award: ${err.message}`);
        }
        reply = `Granted Snapsmith role to ${formatUserTag(target)} for ${days} day(s).`;
      } else if (sub === 'forceremove') {
        const target = interaction.options.getUser('user');
        if (data[target.id]) {
          data[target.id].expiration = null;
          data[target.id].superApproved = false;
        }
        saveData(data);
        try {
          const member = await interaction.guild.members.fetch(target.id);
          await member.roles.remove(SNAPSMITH_ROLE_ID);
          reply = `Removed Snapsmith role from ${formatUserTag(target)}.`;
        } catch (err) {
          reply = `Role removed in data, but Discord role removal failed: ${err.message}`;
        }
      } else if (sub === 'reset') {
        const target = interaction.options.getUser('user');
        if (reactions[target.id] && reactions[target.id][month]) {
          delete reactions[target.id][month];
          if (Object.keys(reactions[target.id]).length === 0) {
            delete reactions[target.id];
          }
          saveReactions(reactions);
          await evaluateRoles(interaction.client, data, reactions);
          reply = `Cleared reaction data for ${formatUserTag(target)} for ${month}.`;
        } else {
          reply = 'No reaction data found for that user this month.';
        }
      } else if (sub === 'debug') {
        const target = interaction.options.getUser('user');
        const record = data[target.id] || null;
        const reactionRecord = reactions[target.id] || null;
        reply = '```json\n' + JSON.stringify({ data: record, reactions: reactionRecord }, null, 2).slice(0, 1900) + '\n```';
      } else if (sub === 'forcesuper') {
        const target = interaction.options.getUser('user');
        const remove = interaction.options.getBoolean('remove') || false;
        const record = ensureUserRecord(data, target.id);
        if (remove) {
          record.superApproved = false;
          reply = `Removed super approval from ${formatUserTag(target)}.`;
        } else {
          record.superApproved = true;
          const now = new Date();
          const newExpiry = new Date(now.getTime() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
          if (!record.expiration || new Date(record.expiration) < newExpiry) {
            record.expiration = newExpiry.toISOString();
          }
          reply = `Marked ${formatUserTag(target)} as super approved.`;
        }
        saveData(data);
      } else if (sub === 'syncroles') {
        await syncCurrentSnapsmiths(interaction.client);
        const freshData = loadData();
        await evaluateRoles(interaction.client, freshData, reactions);
        reply = 'Synced current Snapsmith role holders with stored data.';
      } else if (sub === 'setexpiry') {
        const target = interaction.options.getUser('user');
        const dateString = interaction.options.getString('date');
        const parsed = new Date(`${dateString}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime())) {
          reply = 'Invalid date format. Use YYYY-MM-DD.';
        } else {
          const record = ensureUserRecord(data, target.id);
          record.expiration = parsed.toISOString();
          saveData(data);
          reply = `Set expiration for ${formatUserTag(target)} to ${record.expiration}.`;
        }
      } else if (sub === 'purge') {
        const monthsToKeep = interaction.options.getInteger('months');
        if (monthsToKeep <= 0) {
          reply = 'Months to keep must be greater than zero.';
        } else {
          const cutoff = new Date();
          cutoff.setUTCMonth(cutoff.getUTCMonth() - monthsToKeep + 1);
          const keepMonths = new Set();
          for (let i = 0; i < monthsToKeep; i++) {
            const temp = new Date();
            temp.setUTCMonth(temp.getUTCMonth() - i);
            const key = `${temp.getUTCFullYear()}-${String(temp.getUTCMonth() + 1).padStart(2, '0')}`;
            keepMonths.add(key);
          }
          for (const [userId, months] of Object.entries(reactions)) {
            for (const monthKey of Object.keys(months)) {
              if (!keepMonths.has(monthKey)) {
                delete months[monthKey];
              }
            }
            if (Object.keys(months).length === 0) {
              delete reactions[userId];
            }
          }
          saveReactions(reactions);
          reply = `Purged reaction data older than ${monthsToKeep} month(s).`;
        }
      } else if (sub === 'announce') {
        const target = interaction.options.getUser('user');
        const days = interaction.options.getInteger('days');
        const reactionsCount = interaction.options.getInteger('reactions');
        const superApproved = interaction.options.getBoolean('superapproved');
        const channel = await interaction.client.channels.fetch(SNAPSMITH_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) {
          reply = 'Snapsmith announcement channel could not be reached.';
        } else {
          const parts = [
            `<@${target.id}> has earned **${days} day(s)** of Snapsmith!`
          ];
          if (typeof reactionsCount === 'number') {
            parts.push(`Unique reactions counted: ${reactionsCount}.`);
          }
          if (superApproved) {
            parts.push('Super approval confirmed.');
          }
          await channel.send(parts.join(' '));
          reply = `Announcement sent for ${formatUserTag(target)}.`;
        }
      } else if (sub === 'scan') {
        const limit = interaction.options.getInteger('limit') || undefined;
        const idsRaw = interaction.options.getString('messageids');
        const messageIds = idsRaw ? idsRaw.split(',').map(id => id.trim()).filter(Boolean) : undefined;
        await scanShowcase(interaction.client, { limit, messageIds });
        reply = 'Manual scan started. Check logs for results.';
      }
    } catch (err) {
      logger.error(`snapsmithadmin error (${sub}): ${err.stack || err}`);
      reply = `An error occurred: ${err.message}`;
    }

    await interaction.editReply({ content: reply });
  }
};
