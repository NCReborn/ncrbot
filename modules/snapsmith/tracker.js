// Snapsmith Tracker: Tracks reactions, unique reactors, and handles decay logic

const { loadReactionData, saveReactionData } = require('./Storage');
const REACTION_DECAY_DAYS = 7; // Number of days to track reactions for each post

/**
 * Track a new showcase post.
 * @param {Discord.Message} post - Discord message object representing the showcase post
 */
function trackShowcasePost(post) {
    const reactions = loadReactionData();
    const { id: messageId, author } = post;
    const userId = author.id;
    const now = Date.now();

    // Initialize user and message in reactions data
    if (!reactions[userId]) reactions[userId] = {};
    reactions[userId][messageId] = {
        reactors: [],
        created: now, // timestamp for decay
    };

    saveReactionData(reactions);
}

/**
 * Add a unique reaction to a showcase post.
 * @param {string} messageId - Discord message ID of the showcase post
 * @param {string} reactorId - Discord user ID who reacted
 */
function addReaction(messageId, reactorId) {
    const reactions = loadReactionData();
    for (const userId in reactions) {
        if (reactions[userId][messageId]) {
            const entry = reactions[userId][messageId];
            if (!entry.reactors.includes(reactorId)) {
                entry.reactors.push(reactorId);
                saveReactionData(reactions);
                return true;
            }
        }
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
                // Optionally, could remove the entry entirely, or clear reactors
                entry.reactors = [];
            }
        }
    }
    saveReactionData(reactions);
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
    getUniqueReactors,
    applyDecay,
    getUserReactionStats,
};
