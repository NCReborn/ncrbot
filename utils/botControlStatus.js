const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '../data/botStatus.json');
const MESSAGE_FILE = path.join(__dirname, '../data/botControlMessage.json');

function loadStatus() {
  if (!fs.existsSync(STATUS_FILE)) return { muted: false, running: true };
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
  } catch {
    return { muted: false, running: true };
  }
}

function saveStatus(status) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function loadMessageInfo() {
  if (!fs.existsSync(MESSAGE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(MESSAGE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveMessageInfo(info) {
  fs.writeFileSync(MESSAGE_FILE, JSON.stringify(info, null, 2));
}

function clearMessageInfo() {
  if (fs.existsSync(MESSAGE_FILE)) fs.unlinkSync(MESSAGE_FILE);
}

module.exports = {
  loadStatus,
  saveStatus,
  loadMessageInfo,
  saveMessageInfo,
  clearMessageInfo,
};
