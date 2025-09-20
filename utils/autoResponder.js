const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../data/autoResponses.json');

// Load responses
function loadResponses() {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Save responses
function saveResponses(responses) {
  fs.writeFileSync(filePath, JSON.stringify(responses, null, 2));
}

// Find by trigger (case insensitive)
function findResponse(trigger) {
  const responses = loadResponses();
  return responses.find(r => r.trigger.toLowerCase() === trigger.toLowerCase());
}

// Add or update response
function upsertResponse(trigger, response, wildcard) {
  let responses = loadResponses();
  const index = responses.findIndex(r => r.trigger.toLowerCase() === trigger.toLowerCase());
  if (index !== -1) {
    responses[index] = { trigger, response, wildcard };
  } else {
    responses.push({ trigger, response, wildcard });
  }
  saveResponses(responses);
}

// Delete response
function deleteResponse(trigger) {
  let responses = loadResponses();
  responses = responses.filter(r => r.trigger.toLowerCase() !== trigger.toLowerCase());
  saveResponses(responses);
}

module.exports = {
  loadResponses,
  saveResponses,
  findResponse,
  upsertResponse,
  deleteResponse
};
