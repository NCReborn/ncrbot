const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');
const logger = require('./logger');

const SHOWCASE_CHANNEL_ID = '1285797205927792782';
const SNAPSMITH_CHANNEL_ID = '1406275196133965834';
const SNAPSMITH_ROLE_ID = '1374841261898469378';
const REACTION_TARGET = 25;
const ROLE_DURATION_DAYS = 30;
const MAX_BUFFER_DAYS = 60;
// const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz
const SUPER_APPROVER_ID = '680928073587359902'; // mquiny

const SUPER_APPROVAL_BADGE = '\u2728';
const SUPER_APPROVAL_EMOJI_NAMES = new Set([SUPER_APPROVAL_BADGE, '\u{1F31F}', '\u2B50', 'sparkles', 'star2']);
const SUPER_APPROVAL_EMOJI_IDS = new Set();
const configuredIds = process.env.SUPER_APPROVAL_EMOJI_IDS;
if (configuredIds) {
  configuredIds
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .forEach(id => SUPER_APPROVAL_EMOJI_IDS.add(id));
}

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

async function syncCurrentSnapsmiths(client) {
  logger.debug('syncCurrentSnapsmiths called');
  const data = loadData();
  const guild = client.guilds.cache.values().next().value;
  if (!guild) {
    logger.warn('No guild found for syncCurrentSnapsmiths');
    return;
  }

  let role;
  try {
    role = await guild.roles.fetch(SNAPSMITH_ROLE_ID);
  } catch (error) {
    logger.error(`Role fetch failed: ${error}`);
    return;
  }
  if (!role) {
    logger.warn('Snapsmith role not found in guild');
    return;
  }

  await guild.members.fetch();
  const membersWithRole = guild.members.cache.filter(member => member.roles.cache.has(SNAPSMITH_ROLE_ID));
  logger.debug(`Found ${membersWithRole.size} members with Snapsmith role`);

  const now = new Date();
  let updated = false;
  for (const member of membersWithRole.values()) {
    const userId = member.id;
    if (!data[userId]) {
      data[userId] = {
        months: {},
        expiration: new Date(now.getTime() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        superApproved: false
      };
      updated = true;
    }
  }

  if (updated) {
    saveData(data);
    logger.info('Snapsmith data updated and saved');
  }
}

async function scanShowcase(client, { limit = 100, messageIds = null } = {}) {
  logger.debug(`scanShowcase called. limit=${limit} messageIds=${messageIds ? messageIds.join(',') : 'ALL'}`);
  await syncCurrentSnapsmiths(client);

  const reactions = loadReactions();
  const data = loadData();
  const showcase = await client.channels.fetch(SHOWCASE_CHANNEL_ID);
  const month = getCurrentMonth();

  if (!showcase || showcase.type !== ChannelType.GuildText) {
    logger.warn('Showcase channel not found or is not a text channel');
    return;
  }

  let messages;
  if (Array.isArray(messageIds) && messageIds.length) {
    messages = new Map();
    for (const id of messageIds) {
      try {
        const message = await showcase.messages.fetch(id);
        if (message) {
          messages.set(id, message);
        }
      } catch (error) {
        logger.warn(`Could not fetch message ${id}: ${error.message}`);
      }
    }
  } else {
    const THIRTY_DAYS_AGO = Date.now() - 30 * 24 * 60 * 60 * 1000;
    messages = new Map();
    let lastId;
    let done = false;

    while (!done) {
      const batch = await showcase.messages.fetch({ limit: Math.min(limit, 100), ...(lastId ? { before: lastId } : {}) });
      if (!batch.size) {
        break;
      }

      for (const [id, message] of batch) {
        if (message.createdTimestamp < THIRTY_DAYS_AGO) {
          done = true;
          break;
        }
        messages.set(id, message);
        if (messages.size >= limit) {
          done = true;
          break;
        }
      }

      lastId = [...batch.keys()].pop();
      if (batch.size < 100 || messages.size >= limit) {
        break;
      }
    }
    logger.debug(`Fetched ${messages.size} showcase messages from last 30 days`);
  }

  let messageCount = 0;
  let attachmentCount = 0;

  for (const message of messages.values()) {
    messageCount += 1;
    if (!message.attachments.size) {
      continue;
    }
    attachmentCount += 1;

    const ownerId = message.author.id;
    if (!reactions[ownerId]) reactions[ownerId] = {};
    if (!reactions[ownerId][month]) reactions[ownerId][month] = {};

    const uniqueReactors = new Set();
    let superApproved = false;

    for (const reaction of message.reactions.cache.values()) {
      logger.debug(`Message ${message.id} -- Reaction emoji.name=${reaction.emoji?.name}, emoji.id=${reaction.emoji?.id}`);
      const users = await reaction.users.fetch();
      logger.debug(`Message ${message.id} -- Reaction users: ${Array.from(users.keys()).join(', ')}`);

      users.forEach(user => {
        if (user.id !== message.author.id && !user.bot) {
          uniqueReactors.add(user.id);
        }
      });

      const emojiName = reaction.emoji?.name;
      const emojiId = reaction.emoji?.id;
      const matchesSuperEmoji = (
        (emojiName && SUPER_APPROVAL_EMOJI_NAMES.has(emojiName)) ||
        (emojiId && SUPER_APPROVAL_EMOJI_IDS.has(emojiId))
      );
      const hasSuperApprover = users.has(SUPER_APPROVER_ID);
      logger.debug(`Message ${message.id} -- matchesSuperEmoji=${matchesSuperEmoji}, hasSuperApprover=${hasSuperApprover}`);

      if (matchesSuperEmoji && hasSuperApprover) {
        logger.info(`Super approval detected for user ${ownerId} on message ${message.id}`);
        superApproved = true;
      }
    }

    reactions[ownerId][month][message.id] = Array.from(uniqueReactors);

    if (!data[ownerId]) {
      data[ownerId] = { months: {}, expiration: null, superApproved: false };
    }
    if (superApproved && !data[ownerId].superApproved) {
      const newExpiry = new Date(Date.now() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
      data[ownerId].expiration = newExpiry.toISOString();
      data[ownerId].superApproved = true;
      logger.info(`Attempting to award role to ${ownerId}`);
      try {
        const guild = client.guilds.cache.values().next().value;
        const member = await guild.members.fetch(ownerId);
        await member.roles.add(SNAPSMITH_ROLE_ID);
        const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
        await snapsmithChannel.send(`<@${ownerId}> received a super approval from <@${SUPER_APPROVER_ID}> and is awarded Snapsmith for 30 days! ${SUPER_APPROVAL_BADGE}`);
        logger.info(`Super approval role assigned for ${ownerId}`);
      } catch (error) {
        logger.error(`Super approval role assignment failed for ${ownerId}: ${error.message}`);
      }
    }
  }

  logger.info(`Processed ${messageCount} messages, found ${attachmentCount} with attachments`);
  saveReactions(reactions);
  saveData(data);
  await evaluateRoles(client, data, reactions);
  logger.info('scanShowcase finished');
}

async function evaluateRoles(client, data, reactions) {
  logger.debug('evaluateRoles called');
  const guild = client.guilds.cache.values().next().value;
  if (!guild) {
    logger.warn('No guild available for evaluateRoles');
    return;
  }

  const now = new Date();
  const month = getCurrentMonth();

  for (const [userId, userData] of Object.entries(data)) {
    let totalUniqueReactions = 0;
    const userReactionsMonth = reactions[userId]?.[month] || {};
    for (const reactors of Object.values(userReactionsMonth)) {
      totalUniqueReactions += reactors.length;
    }

    logger.debug(`User ${userId}: ${totalUniqueReactions} unique reactions this month`);

    let durationDays = 0;
    if (userData.superApproved) {
      durationDays += ROLE_DURATION_DAYS;
    }
    if (totalUniqueReactions >= REACTION_TARGET) {
      let additionalMilestones = 0;
      if (userData.superApproved) {
        additionalMilestones = Math.floor((totalUniqueReactions - 5) / REACTION_TARGET);
      } else {
        additionalMilestones = Math.floor(totalUniqueReactions / REACTION_TARGET);
      }
      durationDays += Math.min(additionalMilestones * ROLE_DURATION_DAYS, MAX_BUFFER_DAYS - durationDays);
    }
    durationDays = Math.min(durationDays, MAX_BUFFER_DAYS);

    const currentExpiration = userData.expiration ? new Date(userData.expiration) : null;
    const newExpiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    if (durationDays > 0 && (!currentExpiration || currentExpiration < newExpiry)) {
      userData.expiration = newExpiry.toISOString();

      if (!currentExpiration || currentExpiration < now) {
        try {
          const member = await guild.members.fetch(userId);
          await member.roles.add(SNAPSMITH_ROLE_ID);

          const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
          let message = `<@${userId}> has earned **${durationDays} day(s)** of Snapsmith for receiving ${totalUniqueReactions} unique reactions this month!`;
          if (userData.superApproved) {
            message += ` (Includes Super Approval ${SUPER_APPROVAL_BADGE})`;
          }
          await snapsmithChannel.send(message);
          logger.info(`Role/award message sent for ${userId}`);
        } catch (error) {
          logger.error(`Failed to add role/send award for ${userId}: ${error.message}`);
        }
      }
    }

    if (userData.expiration && new Date(userData.expiration) < now) {
      try {
        const member = await guild.members.fetch(userId);
        await member.roles.remove(SNAPSMITH_ROLE_ID);
        logger.info(`Removed Snapsmith role for expired user ${userId}`);
      } catch (error) {
        logger.error(`Failed to remove role for expired user ${userId}: ${error.message}`);
      }
      userData.expiration = null;
      userData.superApproved = false;
    }
  }

  saveData(data);
  logger.info('evaluateRoles finished');
}

module.exports = {
  startPeriodicScan(client) {
    setInterval(() => {
      logger.info(`Periodic scanShowcase scheduled at ${new Date().toISOString()}`);
      scanShowcase(client).catch(logger.error);
    }, 3600 * 1000);
  },
  syncCurrentSnapsmiths,
  scanShowcase,
  evaluateRoles,
  SNAPSMITH_ROLE_ID,
  SNAPSMITH_CHANNEL_ID,
  SHOWCASE_CHANNEL_ID,
  ROLE_DURATION_DAYS,
  REACTION_TARGET,
  MAX_BUFFER_DAYS
};
