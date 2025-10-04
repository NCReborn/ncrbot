const fs = require('fs');
const path = require('path');

const USER_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'snapsmith.json');
const REACTION_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'snapsmithreactions.json');

function loadUserData() {
    try {
        if (!fs.existsSync(USER_DATA_PATH)) return {};
        return JSON.parse(fs.readFileSync(USER_DATA_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveUserData(data) {
    try {
        fs.writeFileSync(USER_DATA_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Error saving Snapsmith user data: ${err}`);
    }
}

function loadReactionData() {
    try {
        if (!fs.existsSync(REACTION_DATA_PATH)) return {};
        return JSON.parse(fs.readFileSync(REACTION_DATA_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveReactionData(data) {
    try {
        fs.writeFileSync(REACTION_DATA_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Error saving Snapsmith reaction data: ${err}`);
    }
}

module.exports = {
    loadUserData,
    saveUserData,
    loadReactionData,
    saveReactionData,
    USER_DATA_PATH,
    REACTION_DATA_PATH,
};
