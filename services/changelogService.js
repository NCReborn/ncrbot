const { EmbedBuilder } = require('discord.js');
const { 
  sanitizeName, 
  splitLongDescription, 
  sortModsAlphabetically, 
  sortUpdatedModsAlphabetically 
} = require('../utils/discordUtils');
const { getCollectionName } = require('../utils/nexusApi');
const logger = require('../utils/logger');

async function sendCombinedChangelogMessages(channel, diffs1, diffs2, exclusiveChanges, slug1, oldRev1, newRev1, slug2, oldRev2, newRev2) {
  const collectionName1 = getCollectionName(slug1);
  const collectionName2 = getCollectionName(slug2);

  // --- DEBUG LOGS ---
  logger.info(`[CHANGELOG] sendCombinedChangelogMessages called for ${collectionName1} (${oldRev1}→${newRev1}) & ${collectionName2} (${oldRev2}→${newRev2})`);
  logger.debug(`[CHANGELOG] diffs1: ${JSON.stringify(diffs1)}`);
  logger.debug(`[CHANGELOG] diffs2: ${JSON.stringify(diffs2)}`);
  logger.debug(`[CHANGELOG] exclusiveChanges: ${JSON.stringify(exclusiveChanges)}`);

  try {
    // ... [unchanged embeds preamble]

    await channel.send({ embeds: [embed1, embed1a] });

    const collectionHeader = new EmbedBuilder()
      .setTitle(`${collectionName1} (v${oldRev1} → v${newRev1}) & ${collectionName2} (v${oldRev2} → v${newRev2}) Combined Changes`)
      .setColor(1146986);

    await channel.send({ embeds: [collectionHeader] });

    // Defensive: Provide empty arrays if missing/invalid
    diffs1 = diffs1 ?? {};
    diffs2 = diffs2 ?? {};
    exclusiveChanges = exclusiveChanges ?? {};
    const added1 = Array.isArray(diffs1.added) ? diffs1.added : [];
    const added2 = Array.isArray(diffs2.added) ? diffs2.added : [];
    const updated1 = Array.isArray(diffs1.updated) ? diffs1.updated : [];
    const updated2 = Array.isArray(diffs2.updated) ? diffs2.updated : [];
    const removed1 = Array.isArray(diffs1.removed) ? diffs1.removed : [];
    const removed2 = Array.isArray(diffs2.removed) ? diffs2.removed : [];
    const exAdded1 = Array.isArray(exclusiveChanges.added1) ? exclusiveChanges.added1 : [];
    const exAdded2 = Array.isArray(exclusiveChanges.added2) ? exclusiveChanges.added2 : [];
    const exUpdated1 = Array.isArray(exclusiveChanges.updated1) ? exclusiveChanges.updated1 : [];
    const exUpdated2 = Array.isArray(exclusiveChanges.updated2) ? exclusiveChanges.updated2 : [];
    const exRemoved1 = Array.isArray(exclusiveChanges.removed1) ? exclusiveChanges.removed1 : [];
    const exRemoved2 = Array.isArray(exclusiveChanges.removed2) ? exclusiveChanges.removed2 : [];

    // --- DEBUG LOGS FOR DIFF ARRAYS ---
    logger.debug(`[CHANGELOG] Added1: ${JSON.stringify(added1)}`);
    logger.debug(`[CHANGELOG] Added2: ${JSON.stringify(added2)}`);
    logger.debug(`[CHANGELOG] Updated1: ${JSON.stringify(updated1)}`);
    logger.debug(`[CHANGELOG] Updated2: ${JSON.stringify(updated2)}`);
    logger.debug(`[CHANGELOG] Removed1: ${JSON.stringify(removed1)}`);
    logger.debug(`[CHANGELOG] Removed2: ${JSON.stringify(removed2)}`);
    logger.debug(`[CHANGELOG] exAdded1: ${JSON.stringify(exAdded1)}`);
    logger.debug(`[CHANGELOG] exAdded2: ${JSON.stringify(exAdded2)}`);
    logger.debug(`[CHANGELOG] exUpdated1: ${JSON.stringify(exUpdated1)}`);
    logger.debug(`[CHANGELOG] exUpdated2: ${JSON.stringify(exUpdated2)}`);
    logger.debug(`[CHANGELOG] exRemoved1: ${JSON.stringify(exRemoved1)}`);
    logger.debug(`[CHANGELOG] exRemoved2: ${JSON.stringify(exRemoved2)}`);

    // ... [rest of your unchanged code for posting added/updated/removed mods]

    // Added Mods
    // ... [unchanged, but will log arrays]

    // Updated Mods
    // ... [unchanged, but will log arrays]

    // Removed Mods
    // ... [unchanged, but will log arrays]

  } catch (outerErr) {
    logger.error(`Error in sendCombinedChangelogMessages: ${outerErr.message}`);
  }
}

async function sendSingleChangelogMessages(channel, diffs, slug, oldRev, newRev, collectionName) {
  // --- DEBUG LOGS ---
  logger.info(`[CHANGELOG] sendSingleChangelogMessages called for ${collectionName} (${slug} ${oldRev}→${newRev})`);
  logger.debug(`[CHANGELOG] diffs: ${JSON.stringify(diffs)}`);

  try {
    // Defensive: Provide empty arrays if missing/invalid
    diffs = diffs ?? {};
    const added = Array.isArray(diffs.added) ? diffs.added : [];
    const updated = Array.isArray(diffs.updated) ? diffs.updated : [];
    const removed = Array.isArray(diffs.removed) ? diffs.removed : [];

    logger.debug(`[CHANGELOG] Added: ${JSON.stringify(added)}`);
    logger.debug(`[CHANGELOG] Updated: ${JSON.stringify(updated)}`);
    logger.debug(`[CHANGELOG] Removed: ${JSON.stringify(removed)}`);

    // ... [rest of your unchanged code]
  } catch (outerErr) {
    logger.error(`Error in sendSingleChangelogMessages: ${outerErr.message}`);
  }
}

module.exports = {
  sendCombinedChangelogMessages,
  sendSingleChangelogMessages
};
