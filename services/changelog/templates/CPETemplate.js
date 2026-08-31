const { EmbedBuilder } = require('discord.js');
const BaseTemplate = require('./BaseTemplate');

class NCRTemplate extends BaseTemplate {
  // Collection image URLs for thumbnails
  getCollectionImage(slug) {
    const images = {
      'rcuccp': 'https://github.com/NCReborn/content-images/blob/main/CT2-LOGO-BW-photomode_31052025_114439.png', // JPE Core

    };
    return images[slug] || null;
  }

  async generateHeaderEmbeds(revisionInfo) {
    const { collections, gameVersion } = revisionInfo;
    const embeds = [];

    let revisionTitle = `Revision `;
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
        "**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n" +
        "Any issues with updating please refer to <#1400940644565782599> & <#1285797091750187039>\n\n" +
        "If you need further help ping <@&1456751771841204295>"
      )
      .setColor(this.getColor('header'));

    // Add thumbnail image for single collection
    if (collections.length === 1) {
      const collectionImage = this.getCollectionImage(collections[0].slug);
      if (collectionImage) {
        headerEmbed.setThumbnail(collectionImage);
      }
    }

    const updateEmbed = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription(
        "**⚠️ Important** - For a quick guide on updating your collection, follow the section at the end of this channel. <#1503018857567354921>\n\n" 
      )
      .setColor(this.getColor('warning'));

    embeds.push(headerEmbed, updateEmbed);
    return embeds;
  }
}

module.exports = NCRTemplate;
