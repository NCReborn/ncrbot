const CONSTANTS = require('./constants');

module.exports = {
  collectionChannelId: '1395500774150111422', // e.g. '123456789012345678'
  statusChannelId: CONSTANTS.CHANNELS.STATUS,
  statusStable: '🟢┃Status : Stable (Latest)',
  statusChecking: '🟣┃Status : Checking (Latest)',
  statusJustUpdated: '🟣┃Status : Just Updated',
  statusRevertDelayMs: 24 * 60 * 60 * 1000 // 24 hours
};
