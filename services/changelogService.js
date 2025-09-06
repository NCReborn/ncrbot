const { EmbedBuilder } = require('discord.js');
const { splitLongDescription, sortModsAlphabetically, sortUpdatedModsAlphabetically, getCollectionName } = require('../utils/discordUtils');

module.exports = {
  sendCombinedChangelogMessages,
  sendSingleChangelogMessages
};

// Implement the sendCombinedChangelogMessages and sendSingleChangelogMessages functions here
// (These would be the same as your existing functions, just moved to this file)