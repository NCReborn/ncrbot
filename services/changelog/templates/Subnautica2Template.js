const { EmbedBuilder } = require('discord.js');
const BaseTemplate = require('./BaseTemplate');

class Subnautica2Template extends BaseTemplate {

  getCollectionImage(slug) {
    const images = {
      'subnautica2': 'https://raw.githubusercontent.com/NCReborn/content-images/main/sub2/content.png'
    };
    return images[slug] || null;
  }

  async generateHeaderEmbeds(revisionInfo) {
    const { collections, gameVersion } = revisionInfo;
    const embeds = [];

    let revisionTitle = `Subnautica 2 Reborn – Revision `;
    if (collections.length === 1) {
      revisionTitle += `${collections[0].display}-${collections[0].newRev}`;
    } else {
      const parts = collections.map(c => `${c.display}-${c.newRev}`);
      revisionTitle += parts.join('/');
    }
    revisionTitle += ` - Game Version ${gameVersion}`;

    const headerEmbed = new EmbedBuilder()
      .setTitle(revisionTitle)
      .setDescription(
        "**🌊 Subnautica 2 Reborn Updated**\n" +
        "Below are the latest changes detected in the collection."
      )
      .setColor(this.getColor('header'));

    if (collections.length === 1) {
      const collectionImage = this.getCollectionImage(collections[0].slug);
      if (collectionImage) {
        headerEmbed.setThumbnail(collectionImage);
      }
    }

    embeds.push(headerEmbed);
    return embeds;
  }

  async generateDiffEmbeds(collection, diff) {
    const embeds = [];

    const embed = new EmbedBuilder()
      .setTitle(`${collection.display} – Changes`)
      .setColor(this.getColor('changes'))
      .setThumbnail(this.getCollectionImage('subnautica2'));

    if (diff.added.length) {
      embed.addFields({
        name: "🌊 New Additions",
        value: this.formatModList(diff.added)
      });
    }

    if (diff.updated.length) {
      embed.addFields({
        name: "🔧 Updated Mods",
        value: this.formatModList(diff.updated)
      });
    }

    if (diff.removed.length) {
      embed.addFields({
        name: "🗑️ Removed Mods",
        value: this.formatModList(diff.removed)
      });
    }

    embeds.push(embed);
    return embeds;
  }
}

module.exports = Subnautica2Template;
