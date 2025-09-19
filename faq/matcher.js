// Handles fuzzy matching of user questions against FAQ triggers using fuse.js

const Fuse = require('fuse.js');
const { getFAQs } = require('./store');

// Fuse.js options for fuzzy matching
const fuseOptions = {
    includeScore: true,
    threshold: 0.6, // Adjust for stricter/looser matches
    keys: ['triggers'] // Each FAQ entry contains a triggers array
};

let fuse = null;

// Rebuild the Fuse index with the current FAQ entries
function buildIndex() {
    const faqs = getFAQs();
    fuse = new Fuse(faqs, fuseOptions);
}

// Run a fuzzy search against all triggers and return the best match (or null)
function findFAQMatch(userMessage) {
    if (!fuse) buildIndex();
    const results = fuse.search(userMessage);

    if (results.length === 0) return null;

    // Return the best match if the score is below a reasonable threshold
    const top = results[0];
    if (top.score > fuseOptions.threshold) return null;

    return top.item;
}

// Call this when FAQ data changes to refresh the matcher index
function refreshMatcher() {
    buildIndex();
}

module.exports = {
    findFAQMatch,
    refreshMatcher
};
