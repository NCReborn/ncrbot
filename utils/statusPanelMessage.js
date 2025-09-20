const fs = require('fs');
const path = require('path');
const STATUS_PANEL_INFO_PATH = path.join(__dirname, 'statusPanelMessage.json');

function saveStatusPanelInfo(info) {
  fs.writeFileSync(STATUS_PANEL_INFO_PATH, JSON.stringify(info, null, 2));
}

function loadStatusPanelInfo() {
  if (!fs.existsSync(STATUS_PANEL_INFO_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATUS_PANEL_INFO_PATH, 'utf-8'));
}

function clearStatusPanelInfo() {
  if (fs.existsSync(STATUS_PANEL_INFO_PATH)) fs.unlinkSync(STATUS_PANEL_INFO_PATH);
}

module.exports = { saveStatusPanelInfo, loadStatusPanelInfo, clearStatusPanelInfo };
