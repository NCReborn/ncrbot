const { PermissionsBitField } = require('discord.js');
const { fetchRevision, getCollectionSlug, getCollectionName, computeDiff, findExclusiveChanges, processModFiles } = require('../utils/nexusAPI');
const { sendCombinedChangelogMessages, sendSingleChangelogMessages } = require('../services/changelogService');

async function handleDiffCommand(message, args, apiKey, appName, appVersion) {
  // Check if user has administrator permissions
  if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('This command is only available to administrators.');
  }
  
  // Check if we have single collection (4 args) or dual collection (7 args)
  if (args.length !== 4 && args.length !== 7) {
    await message.reply('Utilisation : \n`!diff <collection> <révisionA> <révisionB>` for single collection\n`!diff <collection1> <revA1> <revB1> <collection2> <revA2> <revB2>` for dual collection comparison\n\nSupported collections: NCR, ADR, NCR Lite, ADR Lite');
    return;
  }

  try {
    if (args.length === 4) {
      // Single collection mode
      const collectionInput = args[1];
      const oldRev = parseInt(args[2], 10);
      const newRev = parseInt(args[3], 10);
      
      if (isNaN(oldRev) || isNaN(newRev)) {
        await message.reply('Les numéros de révision doivent être des entiers.');
        return;
      }

      const slug = getCollectionSlug(collectionInput);
      const collectionName = getCollectionName(slug);

      const [oldData, newData] = await Promise.all([
        fetchRevision(slug, oldRev, apiKey, appName, appVersion),
        fetchRevision(slug, newRev, apiKey, appName, appVersion),
      ]);

      const oldMods = processModFiles(oldData.modFiles);
      const newMods = processModFiles(newData.modFiles);

      const diffs = computeDiff(oldMods, newMods);
      await sendSingleChangelogMessages(message.channel, diffs, slug, oldRev, newRev, collectionName);

    } else if (args.length === 7) {
      // Dual collection mode
      const collectionInput1 = args[1];
      const oldRev1 = parseInt(args[2], 10);
      const newRev1 = parseInt(args[3], 10);
      const collectionInput2 = args[4];
      const oldRev2 = parseInt(args[5], 10);
      const newRev2 = parseInt(args[6], 10);
      
      if (isNaN(oldRev1) || isNaN(newRev1) || isNaN(oldRev2) || isNaN(newRev2)) {
        await message.reply('Les numéros de révision doivent être des entiers.');
        return;
      }

      const slug1 = getCollectionSlug(collectionInput1);
      const slug2 = getCollectionSlug(collectionInput2);

      let oldData1, newData1, oldData2, newData2;
      
      try {
        [oldData1, newData1, oldData2, newData2] = await Promise.all([
          fetchRevision(slug1, oldRev1, apiKey, appName, appVersion),
          fetchRevision(slug1, newRev1, apiKey, appName, appVersion),
          fetchRevision(slug2, oldRev2, apiKey, appName, appVersion),
          fetchRevision(slug2, newRev2, apiKey, appName, appVersion),
        ]);
      } catch (error) {
        console.error('Fetch error:', error);
        await message.reply(`Error fetching data: ${error.message}. Please check if all revision numbers exist.`);
        return;
      }

      const oldMods1 = processModFiles(oldData1.modFiles);
      const newMods1 = processModFiles(newData1.modFiles);
      const oldMods2 = processModFiles(oldData2.modFiles);
      const newMods2 = processModFiles(newData2.modFiles);

      const diffs1 = computeDiff(oldMods1, newMods1);
      const diffs2 = computeDiff(oldMods2, newMods2);
      const exclusiveChanges = findExclusiveChanges(diffs1, diffs2);

      await sendCombinedChangelogMessages(message.channel, diffs1, diffs2, exclusiveChanges, slug1, oldRev1, newRev1, slug2, oldRev2, newRev2);
    }

  } catch (err) {
    console.error('Error:', err);
    await message.reply(`Error: ${err.message}. Please check the version numbers and try again.`);
  }
}

module.exports = {
  handleDiffCommand
};
