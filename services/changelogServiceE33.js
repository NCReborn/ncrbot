const { EmbedBuilder } = require('discord.js');
const { 
  sanitizeName, 
  splitLongDescription, 
  sortModsAlphabetically, 
  sortUpdatedModsAlphabetically 
} = require('../utils/discordUtils');
const logger = require('../utils/logger');

/**
 * Expedition 33-specific single changelog posting.
 * Slug: jzmqt4
 * Game version can be overridden if desired; defaults to 1.5.1.
 */
async function sendE33ChangelogMessages(
  channel, diffs, slug, oldRev, newRev, collectionName, gameVersion = "1.5.1"
) {
  logger.info(`[E33 CHANGELOG] sendE33ChangelogMessages called for ${collectionName} (${slug} ${oldRev}→${newRev})`);
  logger.debug(`[E33 CHANGELOG] diffs: ${JSON.stringify(diffs)}`);

  try {
    // Top section (header)
    const embed1 = new EmbedBuilder()
      .setTitle(`Revision ${newRev} - Game Version ${gameVersion}`)
      .setDescription(
        "**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts.\n\n" +
        "Any issues with updating please refer to <#1461441742694781133>\n\n" +
        "If you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>"
      )
      .setColor(5814783);

    // Updating collection section
    const embed2 = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription(
        "If you run into any popups during installation check this thread <#1461441742694781133>\n\n"
      )
      .setColor(16746072);

    await channel.send({ embeds: [embed1, embed2] });

    // Changes header (optional; for consistency with NCR logic)
    const collectionHeader = new EmbedBuilder()
      .setTitle(`${collectionName} (v${oldRev} → v${newRev}) Changes`)
      .setColor(1146986);

    await channel.send({ embeds: [collectionHeader] });

    // Added Mods section
    const addedMods = Array.isArray(diffs.added) ? diffs.added : [];
    if (addedMods.length > 0) {
      const sortedAdded = sortModsAlphabetically([...addedMods]);
      let addedList = sortedAdded.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
      const addedParts = splitLongDescription(addedList);
      for (let i = 0; i < addedParts.length; i++) {
        const title = i === 0 ? "➕ Added Mods" : `➕ Added Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(addedParts[i]).setColor(5763719);
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle("➕ Added Mods")
        .setDescription("No mods were added in this revision")
        .setColor(5763719);
      await channel.send({ embeds: [embed] });
    }

    // Updated Mods section
    const updatedMods = Array.isArray(diffs.updated) ? diffs.updated : [];
    if (updatedMods.length > 0) {
      const sortedUpdated = sortUpdatedModsAlphabetically([...updatedMods]);
      let updatedList = sortedUpdated.map(update => {
        const beforeName = sanitizeName(update.before.name);
        const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
        return `• [${beforeName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
      }).join('\n');
      const updatedParts = splitLongDescription(updatedList);
      for (let i = 0; i < updatedParts.length; i++) {
        const title = i === 0 ? "🔄 Updated Mods" : `🔄 Updated Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(updatedParts[i]).setColor(16776960);
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle("🔄 Updated Mods")
        .setDescription("No mods were updated in this revision")
        .setColor(16776960);
      await channel.send({ embeds: [embed] });
    }

    // Removed Mods section
    const removedMods = Array.isArray(diffs.removed) ? diffs.removed : [];
    if (removedMods.length > 0) {
      const sortedRemoved = sortModsAlphabetically([...removedMods]);
      let removedList = sortedRemoved.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
      const removedParts = splitLongDescription(removedList);
      for (let i = 0; i < removedParts.length; i++) {
        const title = i === 0 ? "🗑️ Removed Mods" : `🗑️ Removed Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(removedParts[i]).setColor(15548997);
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle("🗑️ Removed Mods")
        .setDescription("No mods were removed in this revision")
        .setColor(15548997);
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    logger.error(`[E33 CHANGELOG] Error in sendE33ChangelogMessages: ${error.message}`);
  }
}

module.exports = {
  sendE33ChangelogMessages
};
