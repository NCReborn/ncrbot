const fs = require('fs');
const path = require('path');

function loadFAQs() {
  const faqsPath = path.join(__dirname, 'faq.json');
  if (!fs.existsSync(faqsPath)) return [];
  return JSON.parse(fs.readFileSync(faqsPath, 'utf8'));
}

module.exports = { loadFAQs };
