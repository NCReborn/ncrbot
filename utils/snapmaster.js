const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "snapmaster.json");

function loadDB() {
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = {
    addSubmission(userId, imageCount, messageLink) {
        const db = loadDB();

        if (!db[userId]) {
            db[userId] = {
                count: 0,
                messages: []
            };
        }

        db[userId].count += imageCount;
        db[userId].messages.push(messageLink);

        saveDB(db);
    },

    getAll() {
        return loadDB();
    },

    reset() {
        saveDB({});
    },

    getEligible(min = 5) {
        const db = loadDB();
        return Object.entries(db)
            .filter(([_, data]) => data.count >= min)
            .map(([userId, data]) => ({ userId, count: data.count }));
    },

    getUser(userId) {
        const db = loadDB();
        return db[userId] || null;
    }
};
