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

  try {
    const embed1 = new EmbedBuilder()
      .setTitle(`Revision ${collectionName1}-${newRev1}/${collectionName2}-${newRev2} - Game Version 2.31`)
      .setDescription(
        `**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1400942550076100811>\n\n` +
        `**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n` +
        `**⚠️ Important** - If you encounter any redscript errors please see the recommendations in <#1411463524017770580> as it can sometimes be a simple case of a dependency that hasn't installed properly.\n\n` +
        `**⚠️ Important** - Any fallback installer errors you come across, just select "Yes, install to staging anyway" every time you see it.\n\n` +
        `Any issues with updating please refer to <#1400940644565782599> & <#1285797091750187039>\n\n` +
        `If you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>`
      )
      .setColor(5814783);

    const embed1a = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription(
        `If you run into any popups during installation check these threads <#1400942550076100811> or <#1411463524017770580>\n\n` +
        `If you run into fallback messages just select "Yes, install to staging anyway"  <#1400942550076100811>`
      )
      .setColor(16746072);

    await channel.send({ embeds: [embed1, embed1a] });

    const collectionHeader = new EmbedBuilder()
      .setTitle(`${collectionName1} (v${oldRev1} → v${newRev1}) & ${collectionName2} (v${oldRev2} → v${newRev2}) Combined Changes`)
      .setColor(1146986);

    await channel.send({ embeds: [collectionHeader] });

    // Added Mods
    const allAdded = [...diffs1.added, ...diffs2.added];
    const uniqueAdded = allAdded.filter((mod, index, self) => index === self.findIndex(m => m.id === mod.id));
    const sortedAdded = sortModsAlphabetically([...uniqueAdded]);

    if (sortedAdded.length > 0) {
      const sharedAdded = sortedAdded.filter(mod => 
        !exclusiveChanges.added1.some(m => m.id === mod.id) && 
        !exclusiveChanges.added2.some(m => m.id === mod.id)
      );
      const exclusiveAdded1 = sortModsAlphabetically([...exclusiveChanges.added1]);
      const exclusiveAdded2 = sortModsAlphabetically([...exclusiveChanges.added2]);

      if (sharedAdded.length > 0) {
        await channel.send(`**Shared Added Mods:**\n${sharedAdded.map(mod => sanitizeName(mod.name)).join('\n')}`);
      }
      if (exclusiveAdded1.length > 0) {
        await channel.send(`**Exclusive to ${collectionName1}:**\n${exclusiveAdded1.map(mod => sanitizeName(mod.name)).join('\n')}`);
      }
      if (exclusiveAdded2.length > 0) {
        await channel.send(`**Exclusive to ${collectionName2}:**\n${exclusiveAdded2.map(mod => sanitizeName(mod.name)).join('\n')}`);
      }
    }

    // Repeat similar logic for removed and updated mods as needed
    // Make sure to use Promise.all if you want to send messages in parallel, e.g.:
    // await Promise.all([channel.send(...), channel.send(...)]);
  } catch (error) {
    logger.error(`Error in sendCombinedChangelogMessages: ${error.stack || error}`);
  }
}

module.exports = {
  sendCombinedChangelogMessages
};
