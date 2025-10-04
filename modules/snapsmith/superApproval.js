// Super Approval: Handles logic for multiple super approvers' star reactions and instant Snapsmith bonuses

const { loadUserData, saveUserData } = require('./Storage');
const { grantSnapsmith, addSnapsmithDays, getSnapsmithStatus } = require('./Roles');

// List of super approver Discord user IDs (add more as needed)
const SUPER_APPROVER_IDS = [
    '278359162860077056', // zVeinz
    '680928073587359902' // mquiny
    // Add more IDs here, e.g. '123456789012345678'
];

/**
 * Called when a reaction is added to a showcase post.
 * If a super approver adds a star reaction, triggers the super approval logic.
 * @param {Discord.Message} message - The Discord message object (showcase post)
 * @param {Discord.Reaction} reaction - The reaction object
 * @param {Discord.User} user - The user who added the reaction
 * @param {Discord.Guild} guild - The guild object
 */
async function processSuperApproval(message, reaction, user, guild) {
    // Only process if it's a super approver with a star emoji
    if (!SUPER_APPROVER_IDS.includes(user.id)) return false;
    if (!['🌟', '✨', 'star2'].includes(reaction.emoji.name)) return false;

    const member = await guild.members.fetch(message.author.id);
    const userId = member.id;
    const userData = loadUserData();
    const status = getSnapsmithStatus(userId);

    if (!status.isActive) {
        // Instantly grant Snapsmith role for 30 days
        await grantSnapsmith(member);
        userData[userId].superApproved = true;
        userData[userId].superApproverId = user.id;
        saveUserData(userData);
        return 'granted';
    } else {
        // Already Snapsmith: add 1 day bonus, up to max
        addSnapsmithDays(userId, 1);
        userData[userId].superApprovalBonusDays = (userData[userId].superApprovalBonusDays || 0) + 1;
        userData[userId].lastSuperApproverId = user.id; // Optionally track who gave the latest bonus
        saveUserData(userData);
        return 'bonus';
    }
}

/**
 * Check if a user has super approval on any post (for status display).
 * @param {string} userId
 * @returns {boolean}
 */
function checkSuperApproval(userId) {
    const userData = loadUserData();
    return !!(userData[userId] && userData[userId].superApproved);
}

/**
 * Manually apply a super approval bonus day to a user (admin/mod tools).
 * Optionally specify approverId.
 * @param {string} userId
 * @param {string} approverId
 */
function applySuperApprovalBonus(userId, approverId) {
    addSnapsmithDays(userId, 1);
    const userData = loadUserData();
    userData[userId].superApprovalBonusDays = (userData[userId].superApprovalBonusDays || 0) + 1;
    if (approverId) userData[userId].lastSuperApproverId = approverId;
    saveUserData(userData);
}

module.exports = {
    processSuperApproval,
    checkSuperApproval,
    applySuperApprovalBonus,
    SUPER_APPROVER_IDS,
};
