const fs = require('fs');
const path = require('path');
const { ChannelType, EmbedBuilder } = require('discord.js');
const logger = require('./logger');

const SHOWCASE_CHANNEL_ID = '1285797205927792782';
const SNAPSMITH_CHANNEL_ID = '1406275196133965834';
const SNAPSMITH_ROLE_ID   = '1374841261898469378';
const REACTION_TARGET     = 25;
const ROLE_DURATION_DAYS  = 30;
const EXTRA_DAY_REACTION_COUNT = 5; // <--- Change this value to set reactions per extra day!
const MAX_BUFFER_DAYS     = 60;
const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz
//const SUPER_APPROVER_ID = '680928073587359902'; // mquiny

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

// --- PATCH: Rolling extra days logic ---
function recalculateExpiration(userId, reactionsObj, dataObj, month) {
    const userData = dataObj[userId];
    if (!userData || !userData.snapsmithAchievedAt) {
        return { error: "User has not yet achieved Snapsmith, so cannot recalculate additional days." };
    }
    // Sum all reactions from months after achievement
    let totalUniqueReactions = 0;
    const userReactions = reactionsObj[userId] || {};
    const achievementDate = new Date(userData.snapsmithAchievedAt);

    for (const [mon, posts] of Object.entries(userReactions)) {
        const monDate = new Date(mon + '-01T00:00:00.000Z');
        // PATCH: Include the achievement month itself (>=, not >)
        if (monDate >= achievementDate) {
            for (const reactorsArr of Object.values(posts)) {
                totalUniqueReactions += reactorsArr.length;
            }
        }
    }

    // --- PATCH: For superApproved, initialReactionCount should be 0 ---
    let initialCount = userData.superApproved ? 0 : (userData.initialReactionCount ?? REACTION_TARGET);

    let extraReactions = Math.max(0, totalUniqueReactions - initialCount);
    let additionalDays = Math.floor(extraReactions / EXTRA_DAY_REACTION_COUNT);
    let baseDays = ROLE_DURATION_DAYS;
    let maxDays = MAX_BUFFER_DAYS;

    let achievedTimestamp = typeof userData.snapsmithAchievedAt === 'string'
        ? new Date(userData.snapsmithAchievedAt).getTime()
        : userData.snapsmithAchievedAt;
    let newExpiration = achievedTimestamp + (baseDays + additionalDays) * 24 * 60 * 60 * 1000;
    let today = Date.now();

    let actualDaysLeft = Math.max(0, Math.ceil((newExpiration - today) / (1000 * 60 * 60 * 24)));
    if (actualDaysLeft > maxDays) actualDaysLeft = maxDays;

    userData.expiration = new Date(newExpiration).toISOString();

    return {
        userId,
        totalUniqueReactions,
        additionalDays,
        newExpiration: userData.expiration,
        achieved: achievedTimestamp,
        daysLeft: actualDaysLeft
    };
}

async function syncCurrentSnapsmiths(client) {
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
    }
}

async function scanShowcase(client, { limit = 100, messageIds = null } = {}) {
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
    } else if (limit > 0) {
        let batch = await showcase.messages.fetch({ limit });
        messages = batch;
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
            const users = await reaction.users.fetch();
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
            if (isStar2 && hasSuperApprover) {
                superApproved = true;
            }
        }
        reactions[userId][month][msg.id] = Array.from(uniqueReactors);

        if (!data[userId]) data[userId] = { months: {}, expiration: null, superApproved: false, initialReactionCount: 0 };
        if (superApproved && !data[userId].superApproved) {
            const newExpiry = new Date(Date.now() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
            data[userId].expiration = newExpiry.toISOString();
            data[userId].superApproved = true;
            let totalUniqueReactions = Array.from(uniqueReactors).length;
            data[userId].initialReactionCount = 0;
            data[userId].snapsmithAchievedAt = Date.now();
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
            } catch (e) {
                logger.error(`Super approval role assignment failed for ${userId}: ${e.message}`);
            }
        }
    }

    saveReactions(reactions);
    saveData(data);
    await evaluateRoles(client, data, reactions);
}

async function evaluateRoles(client, data, reactions) {
    const guild = client.guilds.cache.values().next().value;
    const now = new Date();
    const month = getCurrentMonth();

    for (const [userId, userData] of Object.entries(data)) {
        let totalUniqueReactions = 0;
        const userReactions = reactions[userId] || {};
        const achievementDate = userData && userData.snapsmithAchievedAt ? new Date(userData.snapsmithAchievedAt) : null;
        if (achievementDate) {
            for (const [mon, posts] of Object.entries(userReactions)) {
                const monDate = new Date(mon + '-01T00:00:00.000Z');
                if (monDate >= achievementDate) {
                    for (const reactorsArr of Object.values(posts)) {
                        totalUniqueReactions += reactorsArr.length;
                    }
                }
            }
        } else {
            const userReactionsMonth = userReactions[month] || {};
            for (const reactorsArr of Object.values(userReactionsMonth)) {
                totalUniqueReactions += reactorsArr.length;
            }
        }

        const userReactionsMonth = reactions[userId]?.[month] || {};
        let totalUniqueReactionsThisMonth = 0;
        for (const reactorsArr of Object.values(userReactionsMonth)) {
            totalUniqueReactionsThisMonth += reactorsArr.length;
        }

        const currentExpiration = userData.expiration ? new Date(userData.expiration) : null;
        let newExpiration = null;
        let needsAward = false;
        let initialTrigger = false;

        if (
            (userData.superApproved && (!currentExpiration || currentExpiration < now)) ||
            (!userData.superApproved && totalUniqueReactionsThisMonth >= REACTION_TARGET && (!currentExpiration || currentExpiration < now))
        ) {
            newExpiration = new Date(now.getTime() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
            needsAward = true;
            userData.initialReactionCount = totalUniqueReactionsThisMonth;
            userData.snapsmithAchievedAt = Date.now();
            initialTrigger = true;
        }
        else if (currentExpiration && currentExpiration > now && userData.snapsmithAchievedAt) {
            let initialCount = userData.superApproved ? 0 : (userData.initialReactionCount ?? REACTION_TARGET);
            let extraReactions = Math.max(0, totalUniqueReactions - initialCount);
            let extraDays = Math.floor(extraReactions / EXTRA_DAY_REACTION_COUNT);
            let baseDays = ROLE_DURATION_DAYS;
            let maxDays = MAX_BUFFER_DAYS;
            let achievedTimestamp = typeof userData.snapsmithAchievedAt === 'string'
                ? new Date(userData.snapsmithAchievedAt).getTime()
                : userData.snapsmithAchievedAt;
            let calculatedExpiration = achievedTimestamp + (baseDays + extraDays) * 24 * 60 * 60 * 1000;
            let today = Date.now();
            let actualDaysLeft = Math.max(0, Math.ceil((calculatedExpiration - today) / (1000 * 60 * 60 * 24)));
            if (actualDaysLeft > maxDays) actualDaysLeft = maxDays;
            if (Math.abs(new Date(userData.expiration).getTime() - calculatedExpiration) > 60 * 1000) {
                newExpiration = new Date(calculatedExpiration);
                needsAward = true;
            }
        }

        if (newExpiration) {
            let achievedTimestamp = typeof userData.snapsmithAchievedAt === 'string'
                ? new Date(userData.snapsmithAchievedAt).getTime()
                : userData.snapsmithAchievedAt;
            const maxExpiration = achievedTimestamp + MAX_BUFFER_DAYS * 24 * 60 * 60 * 1000;
            if (newExpiration.getTime() > maxExpiration) newExpiration = new Date(maxExpiration);
        }

        if (needsAward && newExpiration) {
            userData.expiration = newExpiration.toISOString();

            try {
                const member = await guild.members.fetch(userId);
                await member.roles.add(SNAPSMITH_ROLE_ID);

                const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);

                let embed;
                if (initialTrigger) {
                    const requirementsStr = userData.superApproved
                        ? `Received a Super Approval 🌟 from <@${SUPER_APPROVER_ID}>`
                        : `Received ${totalUniqueReactionsThisMonth} 🌟 stars from our community`;

                    const detailsStr = userData.superApproved
                        ? `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received a super approval star from <@${SUPER_APPROVER_ID}>, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a symbol of your amazing photomode skills.`
                        : `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received ${totalUniqueReactionsThisMonth} or more 🌟 stars from our community, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a symbol of your amazing photomode skills.`;

                    embed = new EmbedBuilder()
                        .setColor(0xFAA61A)
                        .setTitle('A new Snapsmith Emerges')
                        .addFields(
                            { name: 'Congratulations', value: `<@${userId}>`, inline: false },
                            { name: 'Requirements Met', value: requirementsStr, inline: false },
                            { name: 'Details', value: detailsStr, inline: false }
                        )
                        .setTimestamp();
                } else {
                    let daysLeft = Math.max(0, Math.ceil((newExpiration - now) / (1000 * 60 * 60 * 24)));
                    let usernameDisplay = `<@${userId}>`;
                    try {
                        const userObj = await guild.members.fetch(userId).then(m => m.user).catch(() => null);
                        if (userObj) {
                            usernameDisplay = userObj.username;
                        }
                    } catch (e) {}
                    embed = new EmbedBuilder()
                        .setColor(0xFAA61A)
                        .setTitle(`${usernameDisplay} has earned an additional day!`)
                        .addFields(
                            { name: 'Congratulations', value: `<@${userId}>`, inline: false },
                            { name: 'Details', value: `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received another ${EXTRA_DAY_REACTION_COUNT} reactions, you have earned another day onto your <@&${SNAPSMITH_ROLE_ID}>. Your current balance is **${daysLeft} days**. Keep the amazing submissions coming, choom!`, inline: false }
                        )
                        .setTimestamp();
                }

                await snapsmithChannel.send({ embeds: [embed] });
            } catch (e) {
                logger.error(`Failed to add role/send award for ${userId}: ${e.message}`);
            }
        }

        if (userData.expiration && new Date(userData.expiration) < now) {
            try {
                const member = await guild.members.fetch(userId);
                await member.roles.remove(SNAPSMITH_ROLE_ID);
            } catch (e) {
                logger.error(`Failed to remove role for expired user ${userId}: ${e.message}`);
            }
            userData.expiration = null;
            userData.superApproved = false;
            userData.initialReactionCount = 0;
            userData.snapsmithAchievedAt = null;
        }
    }
    saveData(data);
}

module.exports = {
    startPeriodicScan: function(client) {
        setInterval(() => {
            scanShowcase(client).catch(logger.error);
        }, 3600 * 1000); // Scan every hour
    },
    syncCurrentSnapsmiths,
    scanShowcase,
    SNAPSMITH_ROLE_ID,
    SNAPSMITH_CHANNEL_ID,
    REACTION_TARGET,
    SUPER_APPROVER_ID,
    SHOWCASE_CHANNEL_ID,
    recalculateExpiration,
    loadData,
    saveData,
    loadReactions,
    getCurrentMonth
};
