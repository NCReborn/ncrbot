// services/changelog/ChangelogGenerator.js
const { EmbedBuilder } = require('discord.js');

const logger = require('../../utils/logger');
const GameVersionManager = require('../../utils/GameVersionManager');
const guildConfigManager = require('../../config/guildConfigManager');
const siteChangelogDispatcher = require('../../utils/siteChangelogDispatcher');

// Templates
const NCRTemplate = require('./templates/NCRTemplate');
const E33Template = require('./templates/E33Template');
const Sub2Template = require('./templates/Sub2Template');
const CPETemplate = require('./templates/CPETemplate');

class ChangelogGenerator {
  constructor() {
    this.templates = {
      ncr: NCRTemplate,
      e33: E33Template,
      sub2: Sub2Template,
      cpe: CPETemplate
    };
  }

  getTemplate(templateName, groupConfig) {
    const TemplateClass = this.templates[templateName] || NCRTemplate;
    return new TemplateClass(groupConfig);
  }

  async sendChangelog(client, guildId, groupConfig, revisionData) {
    try {
      const channelId = groupConfig.channelId;
      const channel = await client.channels.fetch(channelId);

      if (!channel) {
        logger.error(`[CHANGELOG] Channel ${channelId} not found in guild ${guildId}`);
        return;
      }

      const template = this.getTemplate(groupConfig.template, groupConfig);

      let gameVersion = groupConfig.gameVersion;
      if (revisionData.collections && revisionData.collections.length > 0) {
        const slug = revisionData.collections[0].slug;
        gameVersion = GameVersionManager.getVersion(guildId, slug);
      }

      const revisionInfo = {
        collections: revisionData.collections,
        gameVersion,
        combined: groupConfig.combined
      };

      // Header embeds
      const headerEmbeds = await template.generateHeaderEmbeds(revisionInfo);
      if (headerEmbeds && headerEmbeds.length > 0) {
        await channel.send({ embeds: headerEmbeds });
      }

      // Changes title
      const changesTitle = template.generateChangesTitle(revisionInfo);
      const changesTitleEmbed = new EmbedBuilder()
        .setTitle(changesTitle)
        .setColor(template.getColor('changes'));

      await channel.send({ embeds: [changesTitleEmbed] });

      // Mod changes
      await this.sendModChanges(channel, template, revisionData);

      logger.info(`[CHANGELOG] Posted to ${groupConfig.name} (${channelId}) in guild ${guildId}`);

      // Push the same changelog to the Preem Team website (no-op unless
      // this collection's slug is allow-listed AND this is the configured
      // CPE guild -- see utils/siteChangelogDispatcher.js)
      const slug = revisionData.collections && revisionData.collections[0]
        ? revisionData.collections[0].slug
        : null;
      if (slug) {
        const sitePayload = this.buildSiteChangelogPayload(revisionInfo, revisionData, groupConfig, guildId);
        await siteChangelogDispatcher.dispatchChangelogToSite(sitePayload, slug);
      }
    } catch (error) {
      logger.error(`[CHANGELOG] Error generating changelog for guild ${guildId}:`, error);
    }
  }

  // Builds the payload consumed by the Preem-Team site's changelog-dispatch
  // GitHub Action -- field names match docs/changelog/template.md exactly.
  buildSiteChangelogPayload(revisionInfo, revisionData, groupConfig, guildId) {
    const { diffs } = revisionData;
    const { collections, gameVersion } = revisionInfo;
    const collection = collections[0];

    const version = collections.length === 1
      ? `${collection.display}-${collection.newRev}`
      : collections.map(c => `${c.display}-${c.newRev}`).join('/');

    const addedItems = (diffs.added && diffs.added.length)
      ? this.sortModsAlphabetically(diffs.added).map(mod => {
          const name = mod.name.replace(/[\[\]()|]/g, '');
          const url = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `- [${name}](${url}) (v${mod.version})`;
        }).join('\n')
      : '';

    const changedItems = (diffs.updated && diffs.updated.length)
      ? this.sortUpdatedModsAlphabetically(diffs.updated).map(mod => {
          const name = mod.before.name.replace(/[\[\]()|]/g, '');
          const url = `https://www.nexusmods.com/${mod.before.domainName}/mods/${mod.before.modId}`;
          return `- [${name}](${url}) (v${mod.before.version} → v${mod.after.version})`;
        }).join('\n')
      : '';

    const removedItems = (diffs.removed && diffs.removed.length)
      ? this.sortModsAlphabetically(diffs.removed).map(mod => {
          const name = mod.name.replace(/[\[\]()|]/g, '');
          const url = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
          return `- [${name}](${url}) (v${mod.version})`;
        }).join('\n')
      : '';

    return {
      collection_slug: collection.slug,
      guild_id: guildId,
      version,
      game_version: gameVersion,
      date: new Date().toISOString().slice(0, 10),
      author: 'Preem Team Bot',
      source_channel: groupConfig.name ? `#${groupConfig.name}` : '#changelog-feed',
      added_items: addedItems,
      updated_items: changedItems,
      removed_items: removedItems
    };
  }

  async sendModChanges(channel, template, revisionData) {
    const { diffs } = revisionData;

    // Added mods
    if (diffs.added && diffs.added.length > 0) {
      const sortedAdded = this.sortModsAlphabetically(diffs.added);
      const addedList = template.formatModList(sortedAdded);
      const addedParts = template.splitLongDescription(addedList);

      for (let i = 0; i < addedParts.length; i++) {
        const title = i === 0 ? '➕ Added Mods' : `➕ Added Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(addedParts[i])
          .setColor(template.getColor('added'));
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle('➕ Added Mods')
        .setDescription('No mods were added in this revision')
        .setColor(template.getColor('added'));
      await channel.send({ embeds: [embed] });
    }

    // Updated mods
    if (diffs.updated && diffs.updated.length > 0) {
      const sortedUpdated = this.sortUpdatedModsAlphabetically(diffs.updated);

      const updatedList = sortedUpdated
        .map(mod => {
          const modName = mod.before.name.replace(/[\[\]()|]/g, '');
          const modUrl = `https://www.nexusmods.com/${mod.before.domainName}/mods/${mod.before.modId}`;
          return `• [${modName}](${modUrl}) (v${mod.before.version} → v${mod.after.version})`;
        })
        .join('\n');

      const updatedParts = template.splitLongDescription(updatedList);

      for (let i = 0; i < updatedParts.length; i++) {
        const title = i === 0 ? '🔄 Updated Mods' : `🔄 Updated Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(updatedParts[i])
          .setColor(template.getColor('updated'));
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle('🔄 Updated Mods')
        .setDescription('No mods were updated in this revision')
        .setColor(template.getColor('updated'));
      await channel.send({ embeds: [embed] });
    }

    // Removed mods
    if (diffs.removed && diffs.removed.length > 0) {
      const sortedRemoved = this.sortModsAlphabetically(diffs.removed);
      const removedList = template.formatModList(sortedRemoved);
      const removedParts = template.splitLongDescription(removedList);

      for (let i = 0; i < removedParts.length; i++) {
        const title = i === 0 ? '🗑️ Removed Mods' : `🗑️ Removed Mods (Part ${i + 1})`;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(removedParts[i])
          .setColor(template.getColor('removed'));
        await channel.send({ embeds: [embed] });
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle('🗑️ Removed Mods')
        .setDescription('No mods were removed in this revision')
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
