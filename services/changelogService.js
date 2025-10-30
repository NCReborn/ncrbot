const { EmbedBuilder } = require('discord.js');
const { 
  sanitizeName, 
  splitLongDescription, 
  sortModsAlphabetically, 
  sortUpdatedModsAlphabetically 
} = require('../utils/discordUtils');
const { getCollectionName } = require('../utils/nexusApi');
const { fetchModCategory } = require('../utils/nexusApi');
const logger = require('../utils/logger');

const NEXUS_API_KEY = process.env.NEXUS_API_KEY;

// Utility to enrich mod array with category
async function enrichModsWithCategory(modList) {
  return await Promise.all(modList.map(async mod => {
    if (!mod.domainName || !mod.modId) return { ...mod, category: "Other" };
    const category = await fetchModCategory(mod.domainName, mod.modId, NEXUS_API_KEY);
    return { ...mod, category };
  }));
}

// For updated mods (before/after shape)
async function enrichUpdatedModsWithCategory(modList) {
  return await Promise.all(modList.map(async update => {
    if (!update.before?.domainName || !update.before?.modId) return { ...update, before: { ...update.before, category: "Other" } };
    const category = await fetchModCategory(update.before.domainName, update.before.modId, NEXUS_API_KEY);
    return { ...update, before: { ...update.before, category } };
  }));
}

// Helper to group mods by category
function groupModsByCategory(modList, isUpdate = false) {
  const groups = {};
  for (const mod of modList) {
    const category = isUpdate
      ? (mod.before?.category || 'Other')
      : (mod.category || 'Other');
    if (!groups[category]) groups[category] = [];
    groups[category].push(mod);
  }
  return groups;
}

// Builds changelog text grouped by category
function buildGroupedModList(mods, isUpdate = false) {
  const grouped = groupModsByCategory(mods, isUpdate);
  let output = '';
  for (const [category, modArr] of Object.entries(grouped)) {
    output += `__**${category}**__\n`;
    output += modArr.map(mod => {
      if (isUpdate) {
        const modName = sanitizeName(mod.before.name);
        const modUrl = `https://www.nexusmods.com/${mod.before.domainName}/mods/${mod.before.modId}`;
        return `• [${modName}](${modUrl}) : v${mod.before.version} → v${mod.after.version}`;
      } else {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }
    }).join('\n');
    output += '\n\n';
  }
  return output.trim();
}

async function sendCombinedChangelogMessages(channel, diffs1, diffs2, exclusiveChanges, slug1, oldRev1, newRev1, slug2, oldRev2, newRev2) {
  const collectionName1 = getCollectionName(slug1);
  const collectionName2 = getCollectionName(slug2);

  try {
    const embed1 = new EmbedBuilder()
      .setTitle(`Revision ${collectionName1}-${newRev1}/${collectionName2}-${newRev2} - Game Version 2.3`)
      .setDescription("**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1400942550076100811>\n\n**⚠️ Important** - To update a collection, ...")
      .setColor(5814783);

    const embed1a = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription("If you run into any popups during installation check these threads <#1400942550076100811> or <#1411463524017770580>\n\nIf you run into fallback messages just select \"Yes, install to staging anyway\"")
      .setColor(16746072);

    await channel.send({ embeds: [embed1, embed1a] });

    const collectionHeader = new EmbedBuilder()
      .setTitle(`${collectionName1} (v${oldRev1} → v${newRev1}) & ${collectionName2} (v${oldRev2} → v${newRev2}) Combined Changes`)
      .setColor(1146986);

    await channel.send({ embeds: [collectionHeader] });

    diffs1 = diffs1 ?? {};
    diffs2 = diffs2 ?? {};
    exclusiveChanges = exclusiveChanges ?? {};
    let added1 = Array.isArray(diffs1.added) ? diffs1.added : [];
    let added2 = Array.isArray(diffs2.added) ? diffs2.added : [];
    let updated1 = Array.isArray(diffs1.updated) ? diffs1.updated : [];
    let updated2 = Array.isArray(diffs2.updated) ? diffs2.updated : [];
    let removed1 = Array.isArray(diffs1.removed) ? diffs1.removed : [];
    let removed2 = Array.isArray(diffs2.removed) ? diffs2.removed : [];
    let exAdded1 = Array.isArray(exclusiveChanges.added1) ? exclusiveChanges.added1 : [];
    let exAdded2 = Array.isArray(exclusiveChanges.added2) ? exclusiveChanges.added2 : [];
    let exUpdated1 = Array.isArray(exclusiveChanges.updated1) ? exclusiveChanges.updated1 : [];
    let exUpdated2 = Array.isArray(exclusiveChanges.updated2) ? exclusiveChanges.updated2 : [];
    let exRemoved1 = Array.isArray(exclusiveChanges.removed1) ? exclusiveChanges.removed1 : [];
    let exRemoved2 = Array.isArray(exclusiveChanges.removed2) ? exclusiveChanges.removed2 : [];

    // CATEGORY ENRICHMENT
    added1 = await enrichModsWithCategory(added1);
    added2 = await enrichModsWithCategory(added2);
    removed1 = await enrichModsWithCategory(removed1);
    removed2 = await enrichModsWithCategory(removed2);
    exAdded1 = await enrichModsWithCategory(exAdded1);
    exAdded2 = await enrichModsWithCategory(exAdded2);
    exRemoved1 = await enrichModsWithCategory(exRemoved1);
    exRemoved2 = await enrichModsWithCategory(exRemoved2);

    updated1 = await enrichUpdatedModsWithCategory(updated1);
    updated2 = await enrichUpdatedModsWithCategory(updated2);
    exUpdated1 = await enrichUpdatedModsWithCategory(exUpdated1);
    exUpdated2 = await enrichUpdatedModsWithCategory(exUpdated2);

    // Added Mods
    const allAdded = [...added1, ...added2];
    const uniqueAdded = allAdded.filter((mod, index, self) => index === self.findIndex(m => m.id === mod.id));
    const sortedAdded = sortModsAlphabetically([...uniqueAdded]);

    if (sortedAdded.length > 0) {
      const sharedAdded = sortedAdded.filter(mod => !exAdded1.some(m => m.id === mod.id) && !exAdded2.some(m => m.id === mod.id));
      const exclusiveAdded1 = sortModsAlphabetically([...exAdded1]);
      const exclusiveAdded2 = sortModsAlphabetically([...exAdded2]);

      let addedList = '';
      if (sharedAdded.length > 0) {
        addedList += buildGroupedModList(sharedAdded);
      }
      if (exclusiveAdded1.length > 0) {
        if (addedList) addedList += '\n\n';
        addedList += `**${collectionName1} Exclusive:**\n` + buildGroupedModList(exclusiveAdded1);
      }
      if (exclusiveAdded2.length > 0) {
        if (addedList) addedList += '\n\n';
        addedList += `**${collectionName2} Exclusive:**\n` + buildGroupedModList(exclusiveAdded2);
      }

      const addedParts = splitLongDescription(addedList);
      for (let i = 0; i < addedParts.length; i++) {
        const title = i === 0 ? "➕ Added Mods" : `➕ Added Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(addedParts[i]).setColor(5763719);
        try {
          await channel.send({ embeds: [embed] });
        } catch (err) {
          logger.error(`Failed to send added mods embed: ${err.message}`);
        }
      }
    } else {
      const embed = new EmbedBuilder().setTitle("➕ Added Mods").setDescription("No mods were added in either collection").setColor(5763719);
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error(`Failed to send empty added mods embed: ${err.message}`);
      }
    }

    // Updated Mods
    const allUpdated = [...updated1, ...updated2];
    const uniqueUpdated = allUpdated.filter((update, index, self) => index === self.findIndex(u => u.before.id === update.before.id));
    const sortedUpdated = sortUpdatedModsAlphabetically([...uniqueUpdated]);

    if (sortedUpdated.length > 0) {
      const sharedUpdated = sortedUpdated.filter(update => !exUpdated1.some(u => u.before.id === update.before.id) && !exUpdated2.some(u => u.before.id === update.before.id));
      const exclusiveUpdated1 = sortUpdatedModsAlphabetically([...exUpdated1]);
      const exclusiveUpdated2 = sortUpdatedModsAlphabetically([...exUpdated2]);

      let updatedList = '';
      if (sharedUpdated.length > 0) {
        updatedList += buildGroupedModList(sharedUpdated, true);
      }
      if (exclusiveUpdated1.length > 0) {
        if (updatedList) updatedList += '\n\n';
        updatedList += `**${collectionName1} Exclusive:**\n` + buildGroupedModList(exclusiveUpdated1, true);
      }
      if (exclusiveUpdated2.length > 0) {
        if (updatedList) updatedList += '\n\n';
        updatedList += `**${collectionName2} Exclusive:**\n` + buildGroupedModList(exclusiveUpdated2, true);
      }

      const updatedParts = splitLongDescription(updatedList);
      for (let i = 0; i < updatedParts.length; i++) {
        const title = i === 0 ? "🔄 Updated Mods" : `🔄 Updated Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(updatedParts[i]).setColor(16776960);
        try {
          await channel.send({ embeds: [embed] });
        } catch (err) {
          logger.error(`Failed to send updated mods embed: ${err.message}`);
        }
      }
    } else {
      const embed = new EmbedBuilder().setTitle("🔄 Updated Mods").setDescription("No mods were updated in either collection").setColor(16776960);
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error(`Failed to send empty updated mods embed: ${err.message}`);
      }
    }

    // Removed Mods
    const allRemoved = [...removed1, ...removed2];
    const uniqueRemoved = allRemoved.filter((mod, index, self) => index === self.findIndex(m => m.id === mod.id));
    const sortedRemoved = sortModsAlphabetically([...uniqueRemoved]);

    if (sortedRemoved.length > 0) {
      const sharedRemoved = sortedRemoved.filter(mod => !exRemoved1.some(m => m.id === mod.id) && !exRemoved2.some(m => m.id === mod.id));
      const exclusiveRemoved1 = sortModsAlphabetically([...exRemoved1]);
      const exclusiveRemoved2 = sortModsAlphabetically([...exRemoved2]);

      let removedList = '';
      if (sharedRemoved.length > 0) {
        removedList += buildGroupedModList(sharedRemoved);
      }
      if (exclusiveRemoved1.length > 0) {
        if (removedList) removedList += '\n\n';
        removedList += `**${collectionName1} Exclusive:**\n` + buildGroupedModList(exclusiveRemoved1);
      }
      if (exclusiveRemoved2.length > 0) {
        if (removedList) removedList += '\n\n';
        removedList += `**${collectionName2} Exclusive:**\n` + buildGroupedModList(exclusiveRemoved2);
      }

      const removedParts = splitLongDescription(removedList);
      for (let i = 0; i < removedParts.length; i++) {
        const title = i === 0 ? "🗑️ Removed Mods" : `🗑️ Removed Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(removedParts[i]).setColor(15548997);
        try {
          await channel.send({ embeds: [embed] });
        } catch (err) {
          logger.error(`Failed to send removed mods embed: ${err.message}`);
        }
      }
    } else {
      const embed = new EmbedBuilder().setTitle("🗑️ Removed Mods").setDescription("No mods were removed in either collection").setColor(15548997);
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error(`Failed to send empty removed mods embed: ${err.message}`);
      }
    }
  } catch (outerErr) {
    logger.error(`Error in sendCombinedChangelogMessages: ${outerErr.message}`);
  }
}

async function sendSingleChangelogMessages(channel, diffs, slug, oldRev, newRev, collectionName) {
  logger.info(`[CHANGELOG] sendSingleChangelogMessages called for ${collectionName} (${slug} ${oldRev}→${newRev})`);
  logger.debug(`[CHANGELOG] diffs: ${JSON.stringify(diffs)}`);

  try {
    diffs = diffs ?? {};
    let added = Array.isArray(diffs.added) ? diffs.added : [];
    let updated = Array.isArray(diffs.updated) ? diffs.updated : [];
    let removed = Array.isArray(diffs.removed) ? diffs.removed : [];

    // CATEGORY ENRICHMENT
    added = await enrichModsWithCategory(added);
    removed = await enrichModsWithCategory(removed);
    updated = await enrichUpdatedModsWithCategory(updated);

    const embed1 = new EmbedBuilder()
      .setTitle(`Revision ${collectionName}-${newRev} - Game Version 2.3`)
      .setDescription("**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1346957358244433950>\n\n**⚠️ Important** - To update a collection, ...")
      .setColor(5814783);

    const embed1a = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription("If you run into any popups during installation check these threads <#1400942550076100811> or <#1411463524017770580>\n\nIf you run into fallback messages just select \"Yes, install to staging anyway\"")
      .setColor(16746072);

    await channel.send({ embeds: [embed1, embed1a] });

    const collectionHeader = new EmbedBuilder()
      .setTitle(`${collectionName} (v${oldRev} → v${newRev}) Changes`)
      .setColor(1146986);

    await channel.send({ embeds: [collectionHeader] });

    // Added Mods
    if (added.length > 0) {
      const sortedAdded = sortModsAlphabetically([...added]);
      let addedList = buildGroupedModList(sortedAdded);

      const addedParts = splitLongDescription(addedList);
      for (let i = 0; i < addedParts.length; i++) {
        const title = i === 0 ? "➕ Added Mods" : `➕ Added Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(addedParts[i]).setColor(5763719);
        try {
          await channel.send({ embeds: [embed] });
        } catch (err) {
          logger.error(`Failed to send added mods embed: ${err.message}`);
        }
      }
    } else {
      const embed = new EmbedBuilder().setTitle("➕ Added Mods").setDescription("No mods were added in this revision").setColor(5763719);
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error(`Failed to send empty added mods embed: ${err.message}`);
      }
    }

    // Updated Mods
    if (updated.length > 0) {
      const sortedUpdated = sortUpdatedModsAlphabetically([...updated]);
      let updatedList = buildGroupedModList(sortedUpdated, true);

      const updatedParts = splitLongDescription(updatedList);
      for (let i = 0; i < updatedParts.length; i++) {
        const title = i === 0 ? "🔄 Updated Mods" : `🔄 Updated Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(updatedParts[i]).setColor(16776960);
        try {
          await channel.send({ embeds: [embed] });
        } catch (err) {
          logger.error(`Failed to send updated mods embed: ${err.message}`);
        }
      }
    } else {
      const embed = new EmbedBuilder().setTitle("🔄 Updated Mods").setDescription("No mods were updated in this revision").setColor(16776960);
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error(`Failed to send empty updated mods embed: ${err.message}`);
      }
    }

    // Removed Mods
    if (removed.length > 0) {
      const sortedRemoved = sortModsAlphabetically([...removed]);
      let removedList = buildGroupedModList(sortedRemoved);

      const removedParts = splitLongDescription(removedList);
      for (let i = 0; i < removedParts.length; i++) {
        const title = i === 0 ? "🗑️ Removed Mods" : `🗑️ Removed Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(removedParts[i]).setColor(15548997);
        try {
          await channel.send({ embeds: [embed] });
        } catch (err) {
          logger.error(`Failed to send removed mods embed: ${err.message}`);
        }
      }
    } else {
      const embed = new EmbedBuilder().setTitle("🗑️ Removed Mods").setDescription("No mods were removed in this revision").setColor(15548997);
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error(`Failed to send empty removed mods embed: ${err.message}`);
      }
    }
  } catch (outerErr) {
    logger.error(`Error in sendSingleChangelogMessages: ${outerErr.message}`);
  }
}

module.exports = {
  sendCombinedChangelogMessages,
  sendSingleChangelogMessages
};
