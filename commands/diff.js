const { PermissionsBitField } = require('discord.js');
const { fetchRevision } = require('../utils/nexusApi');
const { computeDiff, findExclusiveChanges } = require('../utils/discordUtils');
const { sendCombinedChangelogMessages, sendSingleChangelogMessages } = require('../services/changelogService');
const { getCollectionSlug, getCollectionName } = require('../utils/discordUtils');

module.exports = {
  handleDiffCommand: async (message) => {
    // Check admin permissions
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('This command is only available to administrators.');
    }
    
    const args = message.content.split(/\s+/);
    
    // Validate argument count
    if (args.length !== 4 && args.length !== 7) {
      return message.reply('Utilisation : \n`!diff <collection> <révisionA> <révisionB>` for single collection\n`!diff <collection1> <revA1> <revB1> <collection2> <revA2> <revB2>` for dual collection comparison\n\nSupported collections: NCR, ADR, NCR Lite, ADR Lite');
    }
    
    try {
      if (args.length === 4) {
        await handleSingleCollectionDiff(message, args);
      } else {
        await handleDualCollectionDiff(message, args);
      }
    } catch (err) {
      console.error('Error:', err);
      await message.reply(`Error: ${err.message}. Please check the version numbers and try again.`);
    }
  }
};

async function handleSingleCollectionDiff(message, args) {
  const collectionInput = args[1];
  const oldRev = parseInt(args[2], 10);
  const newRev = parseInt(args[3], 10);
  
  if (isNaN(oldRev) || isNaN(newRev)) {
    return message.reply('Les numéros de révision doivent être des entiers.');
  }
  
  const slug = getCollectionSlug(collectionInput);
  const collectionName = getCollectionName(slug);
  
  const [oldData, newData] = await Promise.all([
    fetchRevision(slug, oldRev),
    fetchRevision(slug, newRev),
  ]);
  
  const oldMods = processMods(oldData.modFiles);
  const newMods = processMods(newData.modFiles);
  
  const diffs = computeDiff(oldMods, newMods);
  await sendSingleChangelogMessages(message.channel, diffs, slug, oldRev, newRev, collectionName);
}

async function handleDualCollectionDiff(message, args) {
  const collectionInput1 = args[1];
  const oldRev1 = parseInt(args[2], 10);
  const newRev1 = parseInt(args[3], 10);
  const collectionInput2 = args[4];
  const oldRev2 = parseInt(args[5], 10);
  const newRev2 = parseInt(args[6], 10);
  
  if (isNaN(oldRev1) || isNaN(newRev1) || isNaN(oldRev2) || isNaN(newRev2)) {
    return message.reply('Les numéros de révision doivent être des entiers.');
  }
  
  const slug1 = getCollectionSlug(collectionInput1);
  const slug2 = getCollectionSlug(collectionInput2);
  
  const [oldData1, newData1, oldData2, newData2] = await Promise.all([
    fetchRevision(slug1, oldRev1),
    fetchRevision(slug1, newRev1),
    fetchRevision(slug2, oldRev2),
    fetchRevision(slug2, newRev2),
  ]);
  
  const oldMods1 = processMods(oldData1.modFiles);
  const newMods1 = processMods(newData1.modFiles);
  const oldMods2 = processMods(oldData2.modFiles);
  const newMods2 = processMods(newData2.modFiles);
  
  const diffs1 = computeDiff(oldMods1, newMods1);
  const diffs2 = computeDiff(oldMods2, newMods2);
  const exclusiveChanges = findExclusiveChanges(diffs1, diffs2);
  
  await sendCombinedChangelogMessages(message.channel, diffs1, diffs2, exclusiveChanges, slug1, oldRev1, newRev1, slug2, oldRev2, newRev2);
}

function processMods(modFiles) {
  return modFiles
    .filter((mf) => mf.file && mf.file.mod)
    .map((mf) => ({
      id: mf.file.mod?.modId ? `${mf.file.mod.modId}-${mf.file.mod.game.domainName}` : `${mf.file.mod.name}-${mf.file.mod.game.domainName}`,
      name: mf.file.mod?.name ?? mf.file.name,
      version: mf.file.version,
      domainName: mf.file.mod?.game?.domainName,
      modId: mf.file.mod?.modId
    }));
}