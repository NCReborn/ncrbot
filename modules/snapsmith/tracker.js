const { saveReactionData, loadReactionData } = require('./Storage');
const { addSnapsmithDays, grantSnapsmith, getSnapsmithStatus, BASE_REACTIONS, EXTRA_DAY_REACTION_COUNT, MAX_BUFFER_DAYS } = require('./Roles');
const { loadUserData, saveUserData } = require('./Storage');
const { announceExtraDay, announceNewSnapsmith } = require('./announcer');

const REACTION_DECAY_DAYS = 7;

/**
 * Track a new showcase post.
 * @param {object} message - Discord message object
 */
function trackShowcasePost(message) {
    const reactions = loadReactionData();
    const userId = message.author.id;
    const messageId = message.id;
    const now = Date.now();

    if (!reactions[userId]) reactions[userId] = {};
    if (!reactions[userId][messageId]) {
        reactions[userId][messageId] = {
            reactors: [],
            created: now,
        };
        saveReactionData(reactions);
    }
}

/**
 * Add a unique reaction to a showcase post and trigger milestone logic.
 * @param {string} messageId
 * @param {string} reactorId
 * @param {string|null} authorId
 * @param {Discord.Client|null} client
 * @param {Discord.Guild|null} guild
 */
async function addReaction(messageId, reactorId, authorId = null, client = null, guild = null) {
    const reactions = loadReactionData();
    let found = false;

    // Try to find the post under any user
    for (const userId in reactions) {
        if (reactions[userId][messageId]) {
            found = true;
            const entry = reactions[userId][messageId];
            if (!entry.reactors.includes(reactorId)) {
                entry.reactors.push(reactorId);
                saveReactionData(reactions);

                const author = authorId || userId;
                await handleMilestones(author, client, guild);
                return true;
            }
            return false; // Already reacted
        }
    }

    // If not found, create entry under authorId if provided
    if (!found && authorId) {
        if (!reactions[authorId]) reactions[authorId] = {};
        reactions[authorId][messageId] = {
            reactors: [reactorId],
            created: Date.now(),
        };
        saveReactionData(reactions);

        await handleMilestones(authorId, client, guild);
        return true;
    }

    return false;
}

/**
 * Handles milestone logic for role granting and extra days.
 * @param {string} userId
 * @param {Discord.Client|null} client
 * @param {Discord.Guild|null} guild
 */
async function handleMilestones(userId, client = null, guild = null) {
    const reactions = loadReactionData();
    const userData = loadUserData();
    const stats = getUserReactionStats(userId);
    const status = getSnapsmithStatus(userId);

    // Track the starting point for extra days (default 30, but can be 0 for manual grant)
    let initial = BASE_REACTIONS;
    if (userData[userId] && typeof userData[userId].initialReactionCount === 'number') {
        initial = userData[userId].initialReactionCount;
    }

    // Calculate how many extra days should have been awarded
    const milestoneBlocks = stats.total < initial
        ? 0
        : Math.floor((stats.total - initial) / EXTRA_DAY_REACTION_COUNT);
    const alreadyAwarded = userData[userId]?.reactionMilestoneDays ?? 0;

    // If user doesn't have Snapsmith, grant if they hit BASE_REACTIONS
    if (!status.isActive && stats.total >= initial) {
        if (guild) {
            const member = await guild.members.fetch(userId);
            await grantSnapsmith(member, BASE_REACTIONS);
            if (client) await announceNewSnapsmith(client, userId, null);
        }
        userData[userId] = userData[userId] || {};
        userData[userId].reactionMilestoneDays = 0;
        saveUserData(userData);
        return;
    }

    // If user is Snapsmith, award extra days for new milestones
    if (status.isActive && milestoneBlocks > alreadyAwarded) {
        addSnapsmithDays(userId, milestoneBlocks - alreadyAwarded);
        userData[userId] = userData[userId] || {};
        userData[userId].reactionMilestoneDays = milestoneBlocks;
        saveUserData(userData);
        if (client) await announceExtraDay(client, userId, milestoneBlocks - alreadyAwarded);
    }
}

/**
 * Remove a reaction from a showcase post.
 * @param {string} messageId
 * @param {string} reactorId
 */
function removeReaction(messageId, reactorId) {
    const reactions = loadReactionData();
    for (const userId in reactions) {
        if (reactions[userId][messageId]) {
            const entry = reactions[userId][messageId];
            entry.reactors = entry.reactors.filter(id => id !== reactorId);
            saveReactionData(reactions);
            return true;
        }
    }
    return false;
}

/**
 * Sync all users' reactionMilestoneDays to match their real reaction count.
 * Call this after any manual data changes!
 */
function syncAllMilestoneDays() {
    const userData = loadUserData();
    const reactions = loadReactionData();
    let changed = 0;
    const { addSnapsmithDays } = require('./Roles'); // Make sure this line is present!

    for (const userId in userData) {
        let total = 0;
        if (reactions[userId]) {
            for (const entry of Object.values(reactions[userId])) {
                total += entry.reactors.length;
            }
        }

        // Track the starting point for extra days (default 30, but can be 0 for manual grant)
        let initial = BASE_REACTIONS;
        if (userData[userId] && typeof userData[userId].initialReactionCount === 'number') {
            initial = userData[userId].initialReactionCount;
        }

        // Only count extra days if user has Snapsmith
        if (userData[userId]?.expiration) {
            const milestoneDays = total < initial
                ? 0
                : Math.floor((total - initial) / EXTRA_DAY_REACTION_COUNT);

            // Calculate missing days
            const missingDays = milestoneDays - (userData[userId].reactionMilestoneDays ?? 0);
            if (missingDays > 0) {
                addSnapsmithDays(userId, missingDays);
            }

            if (userData[userId].reactionMilestoneDays !== milestoneDays) {
                userData[userId].reactionMilestoneDays = milestoneDays;
                changed++;
            }
        }
    }
    saveUserData(userData);
    return changed;
}

/**
 * Get stats for a user.
 * @param {string} userId
 * @returns {object} { total: int, recent: int, posts: int }
 */
function getUserReactionStats(userId) {
    const reactions = loadReactionData();
    const now = Date.now();
    const cutoff = now - (REACTION_DECAY_DAYS * 24 * 60 * 60 * 1000);

    let total = 0, recent = 0, posts = 0;
    if (reactions[userId]) {
        for (const entry of Object.values(reactions[userId])) {
            posts++;
            total += entry.reactors.length;
            if (entry.created >= cutoff) {
                recent += entry.reactors.length;
            }
        }
    }
    return { total, recent, posts };
}

module.exports = {
    trackShowcasePost,
    addReaction,
    removeReaction,
    getUserReactionStats,
    syncAllMilestoneDays,
    handleMilestones,
};
