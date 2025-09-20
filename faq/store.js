const fs = require('fs');
const path = require('path');

const faqsPath = path.join(__dirname, 'faq.json');
let faqs = [];

// Loads from disk (used at startup or on demand)
function loadFAQs() {
  if (!fs.existsSync(faqsPath)) return [];
  faqs = JSON.parse(fs.readFileSync(faqsPath, 'utf8'));
  return faqs;
}

// Returns the in-memory FAQ list
function getFAQs() {
  return faqs;
}

// Updates the in-memory FAQ list (and optionally write to disk)
function setFAQs(newFaqs) {
  faqs = newFaqs;
  // Optionally persist to disk:
  // fs.writeFileSync(faqsPath, JSON.stringify(faqs, null, 2), 'utf8');
}

module.exports = {
  loadFAQs,
  getFAQs,
  setFAQs,
};
