const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');

// CONFIG (Replace these with your actual IDs)
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
    console.log('[SNAPSMITH DEBUG] syncCurrentSnapsmiths called!');
    const data = loadData();
    const guild = client.guilds.cache.values().next().value;
    if (!guild) {
        console.log("[SNAPSMITH DEBUG] No guild found for syncCurrentSnapsmiths.");
        return;
    }

    let role;
    try {
        role = await guild.roles.fetch(SNAPSMITH_ROLE_ID);
    } catch (e) {
        console.log("[SNAPSMITH DEBUG] Role fetch failed:", e);
        return;
    }
    if (!role) {
        console.log("[SNAPSMITH DEBUG] Snapsmith role not found in guild.");
        return;
    }

    await guild.members.fetch();
    const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(SNAPSMITH_ROLE_ID));
    console.log(`[SNAPSMITH DEBUG] Found ${membersWithRole.size} members with Snapsmith role.`);

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
        console.log("[SNAPSMITH DEBUG] Snapsmith data updated and saved.");
    } else {
        console.log("[SNAPSMITH DEBUG] No new Snapsmiths to add to data.");
    }
}

/**
 * scanShowcase now accepts:
 *   - limit: number of messages to scan (default 100)
 *   - messageIds: array of message IDs to scan only those messages
 * If scanning same message again, will overwrite tally (no duplicates).
 */
async function scanShowcase(client, { limit = 100, messageIds = null } = {}) {
    console.log(`[SNAPSMITH DEBUG] scanShowcase called! limit=${limit} messageIds=${messageIds ? messageIds.join(',') : 'ALL'}`);
    await syncCurrentSnapsmiths(client);

    const reactions = loadReactions();
    const data = loadData();
    const showcase = await client.channels.fetch(SHOWCASE_CHANNEL_ID);
    const month = getCurrentMonth();

    if (!showcase || showcase.type !== ChannelType.GuildText) {
        console.log('[SNAPSMITH DEBUG] Showcase channel not found or wrong type!');
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
                console.log(`[SNAPSMITH DEBUG] Could not fetch message ${id}: ${e.message}`);
            }
        }
    } else {
        messages = await showcase.messages.fetch({ limit });
    }
    console.log(`[SNAPSMITH DEBUG] Fetched ${messages.size} messages from showcase.`);

    let messageCount = 0;
    let attachmentCount = 0;
    for (const msg of messages.values()) {
        messageCount++;
        if (!msg.attachments.size) continue; // Only scan images
        attachmentCount++;

        const userId = msg.author.id;
        if (!reactions[userId]) reactions[userId] = {};
        if (!reactions[userId][month]) reactions[userId][month] = {};

        let uniqueReactors = new Set();
        let superApproved = false;

        for (const reaction of msg.reactions.cache.values()) {
            // DEBUG: Show emoji info
            console.log(`[SNAPSMITH DEBUG] Message ${msg.id} -- Reaction emoji.name=${reaction.emoji.name}, emoji.id=${reaction.emoji.id}`);
            const users = await reaction.users.fetch();
            // DEBUG: Show all user IDs who reacted
            console.log(`[SNAPSMITH DEBUG] Message ${msg.id} -- Reaction users: ${Array.from(users.keys()).join(', ')}`);

            users.forEach(user => {
                if (user.id !== msg.author.id && !user.bot) {
                    uniqueReactors.add(user.id);
                }
            });

            // DEBUG: Check for super approver in reaction
            const hasSuperApprover = users.has(SUPER_APPROVER_ID);
            console.log(`[SNAPSMITH DEBUG] Message ${msg.id} -- Reaction emoji: ${reaction.emoji.name}, hasSuperApprover=${hasSuperApprover}`);

            // Robust emoji check
            const isStar2 = reaction.emoji.name === '✨' || reaction.emoji.id === '✨' || reaction.emoji.name === 'star2';
            if (isStar2 && hasSuperApprover) {
                console.log(`[SNAPSMITH DEBUG] SUPER APPROVAL DETECTED for user ${userId} on message ${msg.id}`);
                superApproved = true;
            }
        }

        // Overwrite previous reaction tally for this message (no duplicates)
        reactions[userId][month][msg.id] = Array.from(uniqueReactors);

        // Debug log
        console.log(`[SNAPSMITH DEBUG] Message ${msg.id} by ${userId}: ${uniqueReactors.size} unique reactors: ${Array.from(uniqueReactors).join(', ')}`);

        // Super approval logic
        if (!data[userId]) data[userId] = { months: {}, expiration: null, superApproved: false };
        if (superApproved && !data[userId].superApproved) {
            const newExpiry = new Date(Date.now() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
            data[userId].expiration = newExpiry.toISOString();
            data[userId].superApproved = true;
            try {
                const guild = client.guilds.cache.values().next().value;
                const member = await guild.members.fetch(userId);
                await member.roles.add(SNAPSMITH_ROLE_ID);
                const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
                await snapsmithChannel.send(
                    `<@${userId}> has received a **Super Approval** from <@${SUPER_APPROVER_ID}> and is awarded Snapsmith for 30 days! :star2:`
                );
                console.log(`[SNAPSMITH DEBUG] Super approval awarded for ${userId}.`);
            } catch (e) {
                console.log(`[SNAPSMITH DEBUG] Super approval role assignment failed for ${userId}: ${e.message}`);
            }
        }
    }

    console.log(`[SNAPSMITH DEBUG] Processed ${messageCount} messages, found ${attachmentCount} with attachments.`);
    saveReactions(reactions);
    console.log('[SNAPSMITH DEBUG] Reactions file saved. Current data:', JSON.stringify(reactions, null, 2));
    saveData(data);
    await evaluateRoles(client, data, reactions);
    console.log('[SNAPSMITH DEBUG] scanShowcase finished.');
}

async function evaluateRoles(client, data, reactions) {
    console.log('[SNAPSMITH DEBUG] evaluateRoles called!');
    const guild = client.guilds.cache.values().next().value;
    const now = new Date();
    const month = getCurrentMonth();

    for (const [userId, userData] of Object.entries(data)) {
        let totalUniqueReactions = 0;
        const userReactionsMonth = reactions[userId]?.[month] || {};
        for (const reactorsArr of Object.values(userReactionsMonth)) {
            totalUniqueReactions += reactorsArr.length;
        }

        console.log(`[SNAPSMITH DEBUG] User ${userId}: ${totalUniqueReactions} unique reactions this month.`);

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

        // Only send message if NOT already awarded for this period
        if (durationDays > 0 && (!currentExpiration || currentExpiration < newExpiry)) {
            userData.expiration = newExpiry.toISOString();

            if (!currentExpiration || currentExpiration < now) {
                try {
                    const member = await guild.members.fetch(userId);
                    await member.roles.add(SNAPSMITH_ROLE_ID);

                    const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
                    let msg = `<@${userId}> has earned **${durationDays} days** of Snapsmith for receiving ${totalUniqueReactions} unique reactions this month!`;
                    if (userData.superApproved) {
                        msg += ` (Includes Super Approval :star2:)`;
                    }
                    await snapsmithChannel.send(msg);
                    console.log(`[SNAPSMITH DEBUG] Role/award message sent for ${userId}.`);
                } catch (e) {
                    console.log(`[SNAPSMITH DEBUG] Failed to add role/send award for ${userId}: ${e.message}`);
                }
            }
        }

        if (userData.expiration && new Date(userData.expiration) < now) {
            try {
                const member = await guild.members.fetch(userId);
                await member.roles.remove(SNAPSMITH_ROLE_ID);
                console.log(`[SNAPSMITH DEBUG] Removed Snapsmith role for expired user ${userId}.`);
            } catch (e) {
                console.log(`[SNAPSMITH DEBUG] Failed to remove role for expired user ${userId}: ${e.message}`);
            }
            userData.expiration = null;
            userData.superApproved = false;
        }
    }

    saveData(data);
    console.log('[SNAPSMITH DEBUG] evaluateRoles finished.');
}

module.exports = {
    startPeriodicScan: function(client) {
        setInterval(() => {
            scanShowcase(client).catch(console.error);
        }, 3600 * 1000); // Scan every hour
    },
    syncCurrentSnapsmiths,
    scanShowcase
};
