const voiceConfig = require('../config/voiceChannels');

async function updateCollectionVersionChannel(guild, revision) {
  const channel = await guild.channels.fetch(voiceConfig.collectionChannelId).catch(() => null);
  if (channel) {
    await channel.setName(`${voiceConfig.collectionVersionPrefix} (R${revision})`);
  }
}

async function updateStatusChannel(guild, status) {
  const channel = await guild.channels.fetch(voiceConfig.statusChannelId).catch(() => null);
  if (channel) {
    await channel.setName(status);
  }
}

module.exports = {
  updateCollectionVersionChannel,
  updateStatusChannel
};
