// Snapsmith Storage: Handles reading/writing Snapsmith reaction and user data

const fs = require('fs');
const path = require('path');

const REACTION_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmithreactions.json');
const USER_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');

/**
 * Load all Snapsmith reaction data.
 * @returns {object} Parsed reaction data
 */
function loadReactionData() {
    if (fs.existsSync(REACTION_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(REACTION_DATA_PATH, 'utf8'));
    }
    return {};
}

/**
 * Save all Snapsmith reaction data.
 * @param {object} data - Reaction data object to save
 */
function saveReactionData(data) {
    fs.writeFileSync(REACTION_DATA_PATH, JSON.stringify(data, null, 2));
}

/**
 * Load all Snapsmith user meta data.
 * @returns {object} Parsed user meta data
 */
function loadUserData() {
    if (fs.existsSync(USER_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(USER_DATA_PATH, 'utf8'));
    }
    return {};
}

/**
 * Save all Snapsmith user meta data.
 * @param {object} data - User meta data object to save
 */
function saveUserData(data) {
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
    loadReactionData,
    saveReactionData,
    loadUserData,
    saveUserData,
};
