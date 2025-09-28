const fs = require('fs');
const path = require('path');
const { ChannelType, EmbedBuilder } = require('discord.js');
const logger = require('./logger');

const SHOWCASE_CHANNEL_ID = '1285797205927792782';
const SNAPSMITH_CHANNEL_ID = '1406275196133965834';
const SNAPSMITH_ROLE_ID   = '1374841261898469378';
const REACTION_TARGET     = 25;
const ROLE_DURATION_DAYS  = 30;
const MAX_BUFFER_DAYS     = 60;
//const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz
const SUPER_APPROVER_ID = '680928073587359902'; // mquiny

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
    logger.debug('syncCurrentSnapsmiths called!');
    const data = loadData();
    const guild = client.guilds.cache.values().next().value;
    if (!guild) {
        logger.warn("No guild found for syncCurrentSnapsmiths.");
        return;
    }
    let role;
    try {
        role = await guild.roles.fetch(SNAPSMITH_ROLE_ID);
    } catch (e) {
        logger.error("Role fetch failed: " + e);
        return;
    }
    if (!role) {
        logger.warn("Snapsmith role not found in guild.");
        return;
    }
    await guild.members.fetch();
    const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(SNAPSMITH_ROLE_ID));
    logger.debug(`Found ${membersWithRole.size} members with Snapsmith role.`);
    const now = new Date();
    let updated = false;
    for (const member of membersWithRole.values()) {
        const userId = member.id;
        if (!data[userId]) {
            data[userId] = {
                months: {},
                expiration: new Date(now.getTime() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
                superApproved: false,
                initialReactionCount: 0
            };
            updated = true;
        }
    }
    if (updated) {
        saveData(data);
        logger.info("Snapsmith data updated and saved.");
    } else {
        logger.debug("No new Snapsmiths to add to data.");
    }
}

async function scanShowcase(client, { limit = 100, messageIds = null } = {}) {
    logger.debug(`scanShowcase called! limit=${limit} messageIds=${messageIds ? messageIds.join(',') : 'ALL'}`);
    await syncCurrentSnapsmiths(client);

    const reactions = loadReactions();
    const data = loadData();
    const showcase = await client.channels.fetch(SHOWCASE_CHANNEL_ID);
    const month = getCurrentMonth();

    if (!showcase || showcase.type !== ChannelType.GuildText) {
        logger.warn('Showcase channel not found or wrong type!');
        return;
    }

    let messages;
    if (Array.isArray(messageIds) && messageIds.length) {
        messages = new Map();
        for (const id of messageIds) {
            try {
                const msg = await showcase.messages.fetch(id);
                if (msg) messages.set(id, msg);
            } catch (e) {
                logger.warn(`Could not fetch message ${id}: ${e.message}`);
            }
        }
        logger.debug(`Fetched ${messages.size} messages by messageIds.`);
    } else if (limit > 0) {
        let batch = await showcase.messages.fetch({ limit });
        messages = batch;
        logger.debug(`Fetched ${messages.size} messages from showcase (limit: ${limit}).`);
    } else {
        const THIRTY_DAYS_AGO = Date.now() - (30 * 24 * 60 * 60 * 1000);
        messages = new Map();
        let lastId = undefined;
        let done = false;
        while (!done) {
            let batch = await showcase.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
            if (!batch.size) break;
            for (const [id, msg] of batch) {
                if (msg.createdTimestamp < THIRTY_DAYS_AGO) {
                    done = true;
                    break;
                }
                messages.set(id, msg);
            }
            lastId = [...batch.keys()].pop();
            if (batch.size < 100) break;
        }
        logger.debug(`Fetched ${messages.size} messages from showcase (from the last 30 days).`);
    }

    let messageCount = 0;
    let attachmentCount = 0;
    for (const msg of messages.values()) {
        messageCount++;
        if (!msg.attachments.size) continue;
        attachmentCount++;

        const userId = msg.author.id;
        if (!reactions[userId]) reactions[userId] = {};
        if (!reactions[userId][month]) reactions[userId][month] = {};

        let uniqueReactors = new Set();
        let superApproved = false;

        for (const reaction of msg.reactions.cache.values()) {
            logger.debug(`Message ${msg.id} -- Reaction emoji.name=${reaction.emoji.name}, emoji.id=${reaction.emoji.id}`);
            const users = await reaction.users.fetch();
            logger.debug(`Message ${msg.id} -- Reaction users: ${Array.from(users.keys()).join(', ')}`);
            users.forEach(user => {
                if (user.id !== msg.author.id && !user.bot) {
                    uniqueReactors.add(user.id);
                }
            });
            const isStar2 = (
                reaction.emoji.name === '✨' ||
                reaction.emoji.name === '🌟' ||
                reaction.emoji.name === 'star2' ||
                reaction.emoji.id === '✨'
            );
            const hasSuperApprover = users.has(SUPER_APPROVER_ID);
            logger.debug(`Message ${msg.id} -- isStar2=${isStar2}, hasSuperApprover=${hasSuperApprover}`);
            if (isStar2 && hasSuperApprover) {
                logger.info(`SUPER APPROVAL DETECTED for user ${userId} on message ${msg.id}`);
                superApproved = true;
            }
        }
        reactions[userId][month][msg.id] = Array.from(uniqueReactors);

        logger.debug(`User ${userId} pre-check: data.superApproved=${data[userId]?.superApproved}, superApproved=${superApproved}`);
        if (!data[userId]) data[userId] = { months: {}, expiration: null, superApproved: false, initialReactionCount: 0 };
        if (superApproved && !data[userId].superApproved) {
            const newExpiry = new Date(Date.now() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
            data[userId].expiration = newExpiry.toISOString();
            data[userId].superApproved = true;
            // Set initial reaction count for super approval
            let totalUniqueReactions = Array.from(uniqueReactors).length;
            data[userId].initialReactionCount = totalUniqueReactions;
            logger.info(`Attempting to award role to ${userId}`);
            try {
                const guild = client.guilds.cache.values().next().value;
                const member = await guild.members.fetch(userId);
                await member.roles.add(SNAPSMITH_ROLE_ID);
                const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);

                const requirementsStr = `Received a Super Approval 🌟 from <@${SUPER_APPROVER_ID}>`;
                const detailsStr = `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received a super approval star from <@${SUPER_APPROVER_ID}>, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a symbol of your amazing photomode skills.`;

                const embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle('A new Snapsmith Emerges')
                    .addFields(
                        { name: 'Congratulations', value: `<@${userId}>`, inline: false },
                        { name: 'Requirements Met', value: requirementsStr, inline: false },
                        { name: 'Details', value: detailsStr, inline: false }
                    )
                    .setTimestamp();

                await snapsmithChannel.send({ embeds: [embed] });
                logger.info(`Role/award embed sent for ${userId}.`);
            } catch (e) {
                logger.error(`Super approval role assignment failed for ${userId}: ${e.message}`);
            }
        }
    }

    logger.info(`Processed ${messageCount} messages, found ${attachmentCount} with attachments.`);
    saveReactions(reactions);
    saveData(data);
    await evaluateRoles(client, data, reactions);
    logger.info('scanShowcase finished.');
}

// --- PATCHED LOGIC ---
async function evaluateRoles(client, data, reactions) {
    logger.debug('evaluateRoles called!');
    const guild = client.guilds.cache.values().next().value;
    const now = new Date();
    const month = getCurrentMonth();

    for (const [userId, userData] of Object.entries(data)) {
        let totalUniqueReactions = 0;
        const userReactionsMonth = reactions[userId]?.[month] || {};
        for (const reactorsArr of Object.values(userReactionsMonth)) {
            totalUniqueReactions += reactorsArr.length;
        }
        logger.debug(`User ${userId}: ${totalUniqueReactions} unique reactions this month.`);

        const currentExpiration = userData.expiration ? new Date(userData.expiration) : null;
        let newExpiration = null;
        let needsAward = false;

        // Initial trigger logic (award 30 days for Super Approval or reaching 25 reactions)
        if (
            (userData.superApproved && (!currentExpiration || currentExpiration < now)) ||
            (!userData.superApproved && totalUniqueReactions >= REACTION_TARGET && (!currentExpiration || currentExpiration < now))
        ) {
            newExpiration = new Date(now.getTime() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
            needsAward = true;
            // Store initial reaction count for this month
            userData.initialReactionCount = totalUniqueReactions;
        }
        // Extra days after initial trigger
        else if (currentExpiration && currentExpiration > now) {
            let initialCount = userData.initialReactionCount ?? (userData.superApproved ? 0 : REACTION_TARGET);
            let extraReactions = totalUniqueReactions - initialCount;
            let extraDays = Math.floor(extraReactions / 3);
            let currentDaysLeft = Math.ceil((currentExpiration - now) / (1000 * 60 * 60 * 24));
            let newDaysTotal = currentDaysLeft + extraDays;
            let maxDays = Math.min(newDaysTotal, MAX_BUFFER_DAYS);
            let daysToAdd = maxDays - currentDaysLeft;
            if (daysToAdd > 0) {
                newExpiration = new Date(currentExpiration.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
                needsAward = true;
            }
        }

        if (newExpiration) {
            // Enforce max buffer days from now
            const maxExpiration = new Date(now.getTime() + MAX_BUFFER_DAYS * 24 * 60 * 60 * 1000);
            if (newExpiration > maxExpiration) newExpiration = maxExpiration;
        }

        if (needsAward && newExpiration) {
            userData.expiration = newExpiration.toISOString();

            try {
                const member = await guild.members.fetch(userId);
                await member.roles.add(SNAPSMITH_ROLE_ID);

                const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
                const requirementsStr = userData.superApproved
                    ? `Received a Super Approval 🌟 from <@${SUPER_APPROVER_ID}>`
                    : `Received ${totalUniqueReactions} 🌟 stars from our community`;

                const detailsStr = userData.superApproved
                    ? `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received a super approval star from <@${SUPER_APPROVER_ID}>, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a symbol of your amazing photomode skills.`
                    : `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received ${totalUniqueReactions} or more 🌟 stars from our community, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a symbol of your amazing photomode skills.`;

                const embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle('A new Snapsmith Emerges')
                    .addFields(
                        { name: 'Congratulations', value: `<@${userId}>`, inline: false },
                        { name: 'Requirements Met', value: requirementsStr, inline: false },
                        { name: 'Details', value: detailsStr, inline: false }
                    )
                    .setTimestamp();

                await snapsmithChannel.send({ embeds: [embed] });
                logger.info(`Role/award embed sent for ${userId}.`);
            } catch (e) {
                logger.error(`Failed to add role/send award for ${userId}: ${e.message}`);
            }
        }

        if (userData.expiration && new Date(userData.expiration) < now) {
            try {
                const member = await guild.members.fetch(userId);
                await member.roles.remove(SNAPSMITH_ROLE_ID);
                logger.info(`Removed Snapsmith role for expired user ${userId}.`);
            } catch (e) {
                logger.error(`Failed to remove role for expired user ${userId}: ${e.message}`);
            }
            userData.expiration = null;
            userData.superApproved = false;
            userData.initialReactionCount = 0;
        }
    }
    saveData(data);
    logger.info('evaluateRoles finished.');
}

module.exports = {
    startPeriodicScan: function(client) {
        setInterval(() => {
            logger.info('Periodic scanShowcase scheduled at ' + new Date().toISOString());
            scanShowcase(client).catch(logger.error);
        }, 3600 * 1000); // Scan every hour
    },
    syncCurrentSnapsmiths,
    scanShowcase,
    SNAPSMITH_ROLE_ID,
    SNAPSMITH_CHANNEL_ID,
    REACTION_TARGET,
    SUPER_APPROVER_ID,
    SHOWCASE_CHANNEL_ID
};
