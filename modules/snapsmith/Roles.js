// Snapsmith Roles: Handles Snapsmith role assignment, expiry calculation, and removal

const { loadUserData, saveUserData } = require('./snapsmith/snapsmithStorage');
const SNAPSMITH_ROLE_ID = '1374841261898469378'; // Set to your real role ID
const ROLE_DURATION_DAYS = 30;
const EXTRA_DAY_REACTION_COUNT = 10; // Each 10 reactions adds a day
const MAX_BUFFER_DAYS = 60;

/**
 * Grant Snapsmith role to a user for a certain number of days.
 * @param {Discord.GuildMember} member - Discord guild member object
 * @param {number} days - Number of days to grant (default 30)
 */
async function grantSnapsmith(member, days = ROLE_DURATION_DAYS) {
    const userId = member.id;
    const userData = loadUserData();
    const now = Date.now();

    // Set role and expiry
    await member.roles.add(SNAPSMITH_ROLE_ID);
    userData[userId] = userData[userId] || {};
    userData[userId].snapsmithAchievedAt = now;
    userData[userId].expiration = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
    userData[userId].initialReactionCount = 30; // Set to required reactions for initial award
    userData[userId].reactionMilestoneDays = 0;
    userData[userId].superApprovalBonusDays = 0;
    userData[userId].superApproved = false;

    saveUserData(userData);
}

/**
 * Remove Snapsmith role from a user.
 * @param {Discord.GuildMember} member
 */
async function removeSnapsmith(member) {
    const userId = member.id;
    const userData = loadUserData();

    await member.roles.remove(SNAPSMITH_ROLE_ID);

    // Reset user meta
    if (userData[userId]) {
        userData[userId].expiration = null;
        userData[userId].superApproved = false;
        userData[userId].reactionMilestoneDays = 0;
        userData[userId].superApprovalBonusDays = 0;
        userData[userId].snapsmithAchievedAt = null;
    }

    saveUserData(userData);
}

/**
 * Add days to Snapsmith expiry (bonus/reaction milestones).
 * Enforces MAX_BUFFER_DAYS.
 * @param {string} userId
 * @param {number} days
 */
function addSnapsmithDays(userId, days = 1) {
    const userData = loadUserData();
    if (!userData[userId] || !userData[userId].snapsmithAchievedAt) return;

    const achieved = userData[userId].snapsmithAchievedAt;
    const newExpiration = new Date(achieved + Math.min(MAX_BUFFER_DAYS, (days + ROLE_DURATION_DAYS)) * 24 * 60 * 60 * 1000);

    userData[userId].expiration = newExpiration.toISOString();
    saveUserData(userData);
}

/**
 * Get Snapsmith status for a user.
 * @param {string} userId
 * @returns {object} { isActive, expiry, daysLeft }
 */
function getSnapsmithStatus(userId) {
    const userData = loadUserData();
    const now = Date.now();
    if (!userData[userId] || !userData[userId].expiration) {
        return { isActive: false, expiry: null, daysLeft: 0 };
    }
    const expiry = new Date(userData[userId].expiration).getTime();
    const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
    return {
        isActive: expiry > now,
        expiry: userData[userId].expiration,
        daysLeft,
    };
}

/**
 * Expire Snapsmiths whose expiry date has passed.
 * Call this periodically (e.g., daily).
 * @param {Discord.Guild} guild
 */
async function expireSnapsmiths(guild) {
    const userData = loadUserData();
    const now = Date.now();
    for (const userId in userData) {
        const expiry = userData[userId].expiration ? new Date(userData[userId].expiration).getTime() : null;
        if (expiry && expiry < now) {
            try {
                const member = await guild.members.fetch(userId);
                await removeSnapsmith(member);
            } catch (e) {
                // Ignore missing member
            }
        }
    }
}

module.exports = {
    grantSnapsmith,
    removeSnapsmith,
    addSnapsmithDays,
    getSnapsmithStatus,
    expireSnapsmiths,
    SNAPSMITH_ROLE_ID,
    ROLE_DURATION_DAYS,
    EXTRA_DAY_REACTION_COUNT,
    MAX_BUFFER_DAYS,
};
