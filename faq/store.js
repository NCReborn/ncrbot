// Stores all FAQ entries in memory and persists to disk (optional).

const fs = require('fs');
const path = require('path');

const FAQ_PATH = path.join(__dirname, 'faqs.json');

let faqs = [];

function loadFAQs() {
    if (fs.existsSync(FAQ_PATH)) {
        faqs = JSON.parse(fs.readFileSync(FAQ_PATH, 'utf8'));
    }
}

function saveFAQs() {
    fs.writeFileSync(FAQ_PATH, JSON.stringify(faqs, null, 2), 'utf8');
}

function setFAQs(newFAQs) {
    faqs = newFAQs;
    saveFAQs();
}

function getFAQs() {
    return faqs;
}

module.exports = { loadFAQs, saveFAQs, setFAQs, getFAQs };
