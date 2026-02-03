const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const NCRTemplate = require('./templates/NCRTemplate');
const E33Template = require('./templates/E33Template');

class ChangelogGenerator {
  constructor() {
    this.templates = {
      'ncr': NCRTemplate,
      'e33': E33Template
    };
  }

  getTemplate(groupConfig) {
    const TemplateClass = this.templates[groupConfig.template] || NCRTemplate;
    return new TemplateClass(groupConfig);
  }

  async sendChangelog(client, groupConfig, revisionData) {
    try {
      const channelId = groupConfig.channelId;
      const channel = await client.channels.fetch(channelId);
      
      if (!channel) {
        logger.error(`[CHANGELOG] Channel ${channelId} not found`);
        return;
      }

      const template = this.getTemplate(groupConfig);

      const revisionInfo = {
        collections: revisionData.collections,
        gameVersion: groupConfig.gameVersion,
        combined: groupConfig.combined
      };

      const headerEmbeds = await template.generateHeaderEmbeds(revisionInfo);
      if (headerEmbeds.length > 0) {
        await channel.send({ embeds: headerEmbeds });
      }

      const changesTitle = template.generateChangesTitle(revisionInfo);
      const changesTitleEmbed = new EmbedBuilder()
        .setTitle(changesTitle)
        .setColor(template.getColor('changes'));
      await channel.send({ embeds: [changesTitleEmbed] });

      await this.sendModChanges(channel, template, revisionData);

      logger.info(`[CHANGELOG] Posted to ${groupConfig.name} (${channelId})`);

    } catch (error) {
      logger.error(`[CHANGELOG] Error generating changelog:`, error);
    }
  }

  async sendModChanges(channel, template, revisionData) {
    const { diffs } = revisionData;

    // Added mods
    if (diffs.added && diffs.added.length > 0) {
      const sortedAdded = this.sortModsAlphabetically(diffs.added);
      const addedList = template.formatModList(sortedAdded);
      const addedParts = template.splitLongDescription(addedList);

      for (let i = 0; i < addedParts.length; i++) {
        const title = i === 0 ? "➕ Added Mods" : `➕ Added Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(addedParts[i])
          .setColor(template.getColor('added'));
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle("➕ Added Mods")
        .setDescription("No mods were added in this revision")
        .setColor(template.getColor('added'));
      await channel.send({ embeds: [embed] });
    }

    // Updated mods
    if (diffs.updated && diffs.updated.length > 0) {
      const sortedUpdated = this.sortUpdatedModsAlphabetically(diffs.updated);
      const updatedList = sortedUpdated.map(mod => {
        const modName = mod.before.name.replace(/[\[\]()|]/g, '');
        const modUrl = `https://www.nexusmods.com/${mod.before.domainName}/mods/${mod.before.modId}`;
        return `• [${modName}](${modUrl}) (v${mod.before.version} → v${mod.after.version})`;
      }).join('\n');
      
      const updatedParts = template.splitLongDescription(updatedList);

      for (let i = 0; i < updatedParts.length; i++) {
        const title = i === 0 ? "🔄 Updated Mods" : `🔄 Updated Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(updatedParts[i])
          .setColor(template.getColor('updated'));
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle("🔄 Updated Mods")
        .setDescription("No mods were updated in this revision")
        .setColor(template.getColor('updated'));
      await channel.send({ embeds: [embed] });
    }

    // Removed mods
    if (diffs.removed && diffs.removed.length > 0) {
      const sortedRemoved = this.sortModsAlphabetically(diffs.removed);
      const removedList = template.formatModList(sortedRemoved);
      const removedParts = template.splitLongDescription(removedList);

      for (let i = 0; i < removedParts.length; i++) {
        const title = i === 0 ? "🗑️ Removed Mods" : `🗑️ Removed Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(removedParts[i])
          .setColor(template.getColor('removed'));
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle("🗑️ Removed Mods")
        .setDescription("No mods were removed in this revision")
        .setColor(template.getColor('removed'));
      await channel.send({ embeds: [embed] });
    }
  }

  sortModsAlphabetically(mods) {
    return [...mods].sort((a, b) => a.name.localeCompare(b.name));
  }

  sortUpdatedModsAlphabetically(mods) {
    return [...mods].sort((a, b) => a.before.name.localeCompare(b.before.name));
  }
}

module.exports = new ChangelogGenerator();
