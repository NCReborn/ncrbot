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
    // Embed preamble (was missing in your last version!)
    const embed1 = new EmbedBuilder()
      .setTitle(`Revision ${collectionName1}-${newRev1}/${collectionName2}-${newRev2} - Game Version 2.3`)
      .setDescription("**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1400942550076100811>\n\n**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n**⚠️ Important** - If you encounter any redscript errors please see the recommendations in <#1411463524017770580> as it can sometimes be a simple case of a dependency that hasn't installed properly.\n\n**⚠️ Important** - Any fallback installer errors you come across, just select \"Yes, install to staging anyway\" every time you see it.\n\nAny issues with updating please refer to <#1400940644565782599> & <#1285797091750187039>\n\nIf you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>")
      .setColor(5814783);

    const embed1a = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription("If you run into any popups during installation check these threads <#1400942550076100811> or <#1411463524017770580>\n\nIf you run into fallback messages just select \"Yes, install to staging anyway\"  <#1400942550076100811>")
      .setColor(16746072);

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
        addedList += sharedAdded.map(mod => {
          const modName = sanitizeName(mod.name);
          const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `• [${modName} (v${mod.version})](${modUrl})`;
        }).join('\n');
      }

      if (exclusiveAdded1.length > 0) {
        if (addedList) addedList += '\n\n';
        addedList += `**${collectionName1} Exclusive:**\n` + exclusiveAdded1.map(mod => {
          const modName = sanitizeName(mod.name);
          const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `• [${modName} (v${mod.version})](${modUrl})`;
        }).join('\n');
      }

      if (exclusiveAdded2.length > 0) {
        if (addedList) addedList += '\n\n';
        addedList += `**${collectionName2} Exclusive:**\n` + exclusiveAdded2.map(mod => {
          const modName = sanitizeName(mod.name);
          const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `• [${modName} (v${mod.version})](${modUrl})`;
        }).join('\n');
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
        updatedList += sharedUpdated.map(update => {
          const modName = sanitizeName(update.before.name);
          const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
          return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
        }).join('\n');
      }

      if (exclusiveUpdated1.length > 0) {
        if (updatedList) updatedList += '\n\n';
        updatedList += `**${collectionName1} Exclusive:**\n` + exclusiveUpdated1.map(update => {
          const modName = sanitizeName(update.before.name);
          const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
          return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
        }).join('\n');
      }

      if (exclusiveUpdated2.length > 0) {
        if (updatedList) updatedList += '\n\n';
        updatedList += `**${collectionName2} Exclusive:**\n` + exclusiveUpdated2.map(update => {
          const modName = sanitizeName(update.before.name);
          const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
          return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
        }).join('\n');
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
        removedList += sharedRemoved.map(mod => {
          const modName = sanitizeName(mod.name);
          const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `• [${modName} (v${mod.version})](${modUrl})`;
        }).join('\n');
      }

      if (exclusiveRemoved1.length > 0) {
        if (removedList) removedList += '\n\n';
        removedList += `**${collectionName1} Exclusive:**\n` + exclusiveRemoved1.map(mod => {
          const modName = sanitizeName(mod.name);
          const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `• [${modName} (v${mod.version})](${modUrl})`;
        }).join('\n');
      }

      if (exclusiveRemoved2.length > 0) {
        if (removedList) removedList += '\n\n';
        removedList += `**${collectionName2} Exclusive:**\n` + exclusiveRemoved2.map(mod => {
          const modName = sanitizeName(mod.name);
          const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `• [${modName} (v${mod.version})](${modUrl})`;
        }).join('\n');
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

    const embed1 = new EmbedBuilder()
      .setTitle(`Revision ${collectionName}-${newRev} - Game Version 2.3`)
      .setDescription("**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1346957358244433950>\n\n**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n**⚠️ Important** - If you encounter any redscript errors please see the recommendations in <#1332486336040403075> as it can sometimes be a simple case of a dependency that hasn't installed properly.\n\n**⚠️ Important** - Any fallback installer errors you come across, just select \"Yes, install to staging anyway\" every time you see it.\n\nAny issues with updating please refer to <#1285796905640788030> & <#1285797091750187039>\n\nIf you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>")
      .setColor(5814783);

    const embed1a = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription("If you run into any popups during installation check these threads <#1400942550076100811> or <#1411463524017770580>\n\nIf you run into fallback messages just select \"Yes, install to staging anyway\"  <#1332486336967610449>")
      .setColor(16746072);

    await channel.send({ embeds: [embed1, embed1a] });

    const collectionHeader = new EmbedBuilder()
      .setTitle(`${collectionName} (v${oldRev} → v${newRev}) Changes`)
      .setColor(1146986);

    await channel.send({ embeds: [collectionHeader] });

    // Added Mods
    if (added.length > 0) {
      const sortedAdded = sortModsAlphabetically([...added]);
      let addedList = sortedAdded.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');

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
      let updatedList = sortedUpdated.map(update => {
        const modName = sanitizeName(update.before.name);
        const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
        return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
      }).join('\n');

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
      let removedList = sortedRemoved.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');

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
