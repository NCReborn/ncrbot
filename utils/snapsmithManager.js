const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');

// CONFIG (Replace with your actual IDs)
const SHOWCASE_CHANNEL_ID = '1285797205927792782';
const SNAPSMITH_CHANNEL_ID = '1406275196133965834';
const SNAPSMITH_ROLE_ID   = '1374841261898469378';
const REACTION_TARGET     = 25;
const ROLE_DURATION_DAYS  = 30;
const MAX_BUFFER_DAYS     = 60;
const SUPER_APPROVER_ID   = '278359162860077056'; // zVeinz

// Persistent data path
const DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');

function loadData() {
    if (fs.existsSync(DATA_PATH)) {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
    return {};
}

function saveData(data) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// Utilities
function getCurrentMonth() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Sync current Snapsmith role holders into the system
async function syncCurrentSnapsmiths(client) {
    const data = loadData();
    const guild = client.guilds.cache.first();
    if (!guild) return;

    let role;
    try {
        role = await guild.roles.fetch(SNAPSMITH_ROLE_ID);
    } catch (e) {
        return;
    }
    if (!role) return;

    let membersWithRole;
    try {
        membersWithRole = await role.members;
        membersWithRole = [...membersWithRole.values()];
    } catch (e) {
        await guild.members.fetch();
        membersWithRole = [...guild.members.cache.filter(m => m.roles.cache.has(SNAPSMITH_ROLE_ID)).values()];
    }

    const now = new Date();
    for (const member of membersWithRole) {
        const userId = member.id;
        if (!data[userId]) {
            data[userId] = {
                months: {},
                expiration: new Date(now.getTime() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
                superApproved: false
            };
        }
    }

    saveData(data);
}

// Main scan function
async function scanShowcase(client) {
    await syncCurrentSnapsmiths(client);

    const data = loadData();
    const showcase = await client.channels.fetch(SHOWCASE_CHANNEL_ID);
    const now = new Date();
    const month = getCurrentMonth();

    if (!showcase || showcase.type !== ChannelType.GuildText) return;

    const messages = await showcase.messages.fetch({ limit: 100 });
    for (const msg of messages.values()) {
        if (!msg.attachments.size) continue;

        const userId = msg.author.id;
        if (!data[userId]) data[userId] = { months: {}, expiration: null, superApproved: false };

        if (!data[userId].months[month]) data[userId].months[month] = {};

        // Collect unique user IDs who reacted to this message (per photo)
        let uniqueReactors = new Set();
        let superApproved = false;
        for (const reaction of msg.reactions.cache.values()) {
            const users = await reaction.users.fetch();
            users.forEach(user => {
                if (user.id !== msg.author.id && !user.bot) {
                    uniqueReactors.add(user.id);
                }
            });
            // Check for super approval (star2 emoji by zVeinz)
            if (
                reaction.emoji.name === 'star2' || reaction.emoji.id === '✨' || reaction.emoji.name === '✨'
            ) {
                if (users.has(SUPER_APPROVER_ID)) {
                    superApproved = true;
                }
            }
        }
        // Store array of unique reactor user IDs for this message
        data[userId].months[month][msg.id] = Array.from(uniqueReactors);

        // Super approval logic
        if (superApproved && !data[userId].superApproved) {
            const newExpiry = new Date(Date.now() + ROLE_DURATION_DAYS * 24 * 60 * 60 * 1000);
            data[userId].expiration = newExpiry.toISOString();
            data[userId].superApproved = true;

            try {
                const guild = client.guilds.cache.first();
                const member = await guild.members.fetch(userId);
                await member.roles.add(SNAPSMITH_ROLE_ID);
                const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
                await snapsmithChannel.send(
                    `<@${userId}> has received a **Super Approval** from <@${SUPER_APPROVER_ID}> and is awarded Snapsmith for 30 days! :star2:`
                );
            } catch (e) {}
        }
    }

    saveData(data);
    await evaluateRoles(client, data);
}

// Evaluate reactions and update roles
async function evaluateRoles(client, data) {
    const guild = client.guilds.cache.first();
    const now = new Date();
    const month = getCurrentMonth();

    for (const [userId, userData] of Object.entries(data)) {
        // Sum all unique user counts across all their images for the month
        let totalUniqueReactions = 0;
        const monthData = userData.months[month] || {};
        for (const reactorsArr of Object.values(monthData)) {
            totalUniqueReactions += reactorsArr.length; // Only count unique users per photo
        }

        // Duration logic
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

        // Calculate new expiration
        if (durationDays > 0) {
            const currentExpiration = userData.expiration ? new Date(userData.expiration) : null;
            const newExpiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

            if (!currentExpiration || currentExpiration < newExpiry) {
                userData.expiration = newExpiry.toISOString();

                try {
                    const member = await guild.members.fetch(userId);
                    await member.roles.add(SNAPSMITH_ROLE_ID);

                    const snapsmithChannel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
                    let msg = `<@${userId}> has earned **${durationDays} days** of Snapsmith for receiving ${totalUniqueReactions} unique reactions this month!`;
                    if (userData.superApproved) {
                        msg += ` (Includes Super Approval :star2:)`;
                    }
                    await snapsmithChannel.send(msg);
                } catch (e) {}
            }
        }

        // Remove role if expired
        if (userData.expiration && new Date(userData.expiration) < now) {
            try {
                const member = await guild.members.fetch(userId);
                await member.roles.remove(SNAPSMITH_ROLE_ID);
            } catch (e) {}
            userData.expiration = null;
            userData.superApproved = false;
        }
    }

    saveData(data);
}

module.exports = {
    startPeriodicScan: function(client) {
        setInterval(() => {
            scanShowcase(client).catch(console.error);
        }, 3600 * 1000); // Scan every hour
    },
    syncCurrentSnapsmiths
};
