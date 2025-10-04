const { saveReactionData, loadReactionData } = require('./Storage');

const BASE_REACTIONS = 30;         // reactions required for initial Snapsmith
const EXTRA_DAY_REACTIONS = 10;    // reactions per additional day
const MAX_DAYS = 60;
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
 * Add a unique reaction to a showcase post.
 * Ensures the post entry exists; creates it if missing (using authorId if provided).
 * @param {string} messageId - Discord message ID of the showcase post
 * @param {string} reactorId - Discord user ID who reacted
 * @param {string|null} authorId - Discord user ID of showcase post author (optional, used if entry missing)
 */
function addReaction(messageId, reactorId, authorId = null) {
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
        return true;
    }

    return false;
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
 * Get unique reactors for a post.
 * @param {string} messageId
 * @returns {string[]} Array of user IDs
 */
function getUniqueReactors(messageId) {
    const reactions = loadReactionData();
    for (const userId in reactions) {
        if (reactions[userId][messageId]) {
            return reactions[userId][messageId].reactors;
        }
    }
    return [];
}

/**
 * Apply decay to reactions (remove reactors for posts older than REACTION_DECAY_DAYS).
 * Should be called periodically (e.g., daily).
 */
function applyDecay() {
    const reactions = loadReactionData();
    const now = Date.now();
    const cutoff = now - (REACTION_DECAY_DAYS * 24 * 60 * 60 * 1000);

    for (const userId in reactions) {
        for (const messageId in reactions[userId]) {
            const entry = reactions[userId][messageId];
            if (entry.created < cutoff) {
                entry.reactors = [];
            }
        }
    }
    saveReactionData(reactions);
}

/**
 * Get stats for a user.
 * @param {string} userId
 * @returns {object} { total: int, recent: int, posts: int, days: int }
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
    // Days logic: 30 to start, +1 day for each additional 10 reactions, capped at 60 days max
    let days = 0;
    if (total < BASE_REACTIONS) {
        days = total; // If below the threshold, days = reaction count
    } else {
        const additionalDays = Math.floor((total - BASE_REACTIONS) / EXTRA_DAY_REACTIONS);
        days = Math.min(BASE_REACTIONS + additionalDays, MAX_DAYS);
    }
    return { total, recent, posts, days };
}

module.exports = {
    trackShowcasePost,
    addReaction,
    removeReaction,
    getUniqueReactors,
    applyDecay,
    getUserReactionStats,
    BASE_REACTIONS,
    EXTRA_DAY_REACTIONS,
    MAX_DAYS,
};
