const { EmbedBuilder } = require('discord.js');
const { 
  sanitizeName, 
  sortModsAlphabetically, 
  sortUpdatedModsAlphabetically 
} = require('../utils/discordUtils');
const { getCollectionName } = require('../utils/nexusApi');
const logger = require('../utils/logger');

function formatModList(mods) {
  return mods.map(mod => `• ${sanitizeName(mod.name)}`).join('\n');
}

function formatUpdatedModList(mods) {
  return mods.map(mod => `• ${sanitizeName(mod.name)}: v${mod.oldVersion} → v${mod.newVersion}`).join('\n');
}

async function sendCombinedChangelogMessages(channel, diffs1, diffs2, exclusiveChanges, slug1, oldRev1, newRev1, slug2, oldRev2, newRev2) {
  const collectionName1 = getCollectionName(slug1);
  const collectionName2 = getCollectionName(slug2);

  try {
    // 1. Title embed
    const titleEmbed = new EmbedBuilder()
      .setTitle(`Revision ${collectionName1}-${newRev1}/${collectionName2}-${newRev2} - Game Version 2.3`)
      .setDescription(
        `**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1400942550076100811>\n\n` +
        `**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n` +
        `**⚠️ Important** - If you encounter any redscript errors please see the recommendations in 🧩 Common Issues as it can sometimes be a simple case of a dependency that hasn't installed properly.\n\n` +
        `**⚠️ Important** - Any fallback installer errors you come across, just select "Yes, install to staging anyway" every time you see it.\n\n` +
        `Any issues with updating please refer to 🗂️ | faq-and-guides & # 🚨 | common-fixes\n\n` +
        `If you need further help ping a @Ripperdoc or @Techie`
      )
      .setColor(0x23272A);

    // 2. Updating collection embed
    const updateEmbed = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription(
        `If you run into any popups during installation check these threads 🧩 How to update a collection. or 🧩 Common Issues\n\n` +
        `If you run into fallback messages just select "Yes, install to staging anyway" 🧩 How to update a collection.`
      )
      .setColor(0xfca311);

    // 3. Combined Changes embed
    const combinedEmbed = new EmbedBuilder()
      .setTitle(`${collectionName1} (v${oldRev1} → v${newRev1}) & ${collectionName2} (v${oldRev2} → v${newRev2}) Combined Changes`)
      .setColor(0x43b581);

    // --- ADDED MODS ---
    const allAdded = sortModsAlphabetically([
      ...diffs1.added, ...diffs2.added
    ]);
    const sharedAdded = allAdded.filter(mod =>
      !exclusiveChanges.added1.some(m => m.id === mod.id) &&
      !exclusiveChanges.added2.some(m => m.id === mod.id)
    );
    const exclusiveAdded1 = sortModsAlphabetically([...exclusiveChanges.added1]);
    const exclusiveAdded2 = sortModsAlphabetically([...exclusiveChanges.added2]);

    let addedModsText = "";
    if (sharedAdded.length > 0) {
      addedModsText += `**Shared Added Mods:**\n${formatModList(sharedAdded)}\n`;
    }
    if (exclusiveAdded1.length > 0) {
      addedModsText += `\n**${collectionName1} Exclusive:**\n${formatModList(exclusiveAdded1)}\n`;
    }
    if (exclusiveAdded2.length > 0) {
      addedModsText += `\n**${collectionName2} Exclusive:**\n${formatModList(exclusiveAdded2)}\n`;
    }
    if (addedModsText) {
      combinedEmbed.addFields({ name: "➕ Added Mods", value: addedModsText.substring(0, 1024) });
      if (addedModsText.length > 1024) {
        combinedEmbed.addFields({ name: '\u200b', value: addedModsText.substring(1024, 2048) });
      }
    }

    // --- REMOVED MODS ---
    const allRemoved = sortModsAlphabetically([
      ...diffs1.removed, ...diffs2.removed
    ]);
    const sharedRemoved = allRemoved.filter(mod =>
      !exclusiveChanges.removed1.some(m => m.id === mod.id) &&
      !exclusiveChanges.removed2.some(m => m.id === mod.id)
    );
    const exclusiveRemoved1 = sortModsAlphabetically([...exclusiveChanges.removed1]);
    const exclusiveRemoved2 = sortModsAlphabetically([...exclusiveChanges.removed2]);

    let removedModsText = "";
    if (sharedRemoved.length > 0) {
      removedModsText += `**Shared Removed Mods:**\n${formatModList(sharedRemoved)}\n`;
    }
    if (exclusiveRemoved1.length > 0) {
      removedModsText += `\n**${collectionName1} Exclusive:**\n${formatModList(exclusiveRemoved1)}\n`;
    }
    if (exclusiveRemoved2.length > 0) {
      removedModsText += `\n**${collectionName2} Exclusive:**\n${formatModList(exclusiveRemoved2)}\n`;
    }
    if (removedModsText) {
      combinedEmbed.addFields({ name: "➖ Removed Mods", value: removedModsText.substring(0, 1024) });
      if (removedModsText.length > 1024) {
        combinedEmbed.addFields({ name: '\u200b', value: removedModsText.substring(1024, 2048) });
      }
    }

    // --- UPDATED MODS ---
    const allUpdated = sortUpdatedModsAlphabetically([
      ...diffs1.updated, ...diffs2.updated
    ]);
    const sharedUpdated = allUpdated.filter(mod =>
      !exclusiveChanges.updated1.some(m => m.id === mod.id) &&
      !exclusiveChanges.updated2.some(m => m.id === mod.id)
    );
    const exclusiveUpdated1 = sortUpdatedModsAlphabetically([...exclusiveChanges.updated1]);
    const exclusiveUpdated2 = sortUpdatedModsAlphabetically([...exclusiveChanges.updated2]);

    let updatedModsText = "";
    if (sharedUpdated.length > 0) {
      updatedModsText += `**Shared Updated Mods:**\n${formatUpdatedModList(sharedUpdated)}\n`;
    }
    if (exclusiveUpdated1.length > 0) {
      updatedModsText += `\n**${collectionName1} Exclusive:**\n${formatUpdatedModList(exclusiveUpdated1)}\n`;
    }
    if (exclusiveUpdated2.length > 0) {
      updatedModsText += `\n**${collectionName2} Exclusive:**\n${formatUpdatedModList(exclusiveUpdated2)}\n`;
    }
    if (updatedModsText) {
      combinedEmbed.addFields({ name: "🟦 Updated Mods", value: updatedModsText.substring(0, 1024) });
      if (updatedModsText.length > 1024) {
        combinedEmbed.addFields({ name: '\u200b', value: updatedModsText.substring(1024, 2048) });
      }
    }

    // --- SEND ALL EMBEDS ---
    await channel.send({ embeds: [titleEmbed] });
    await channel.send({ embeds: [updateEmbed] });
    await channel.send({ embeds: [combinedEmbed] });

  } catch (error) {
    logger.error(`Error in sendCombinedChangelogMessages: ${error.stack || error}`);
  }
}

module.exports = {
  sendCombinedChangelogMessages
};
