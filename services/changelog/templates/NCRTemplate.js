const { EmbedBuilder } = require('discord.js');
const BaseTemplate = require('./BaseTemplate');

class NCRTemplate extends BaseTemplate {
  // Collection image URLs for thumbnails
  getCollectionImage(slug) {
    const images = {
      'rcuccp': 'https://media.nexusmods.com/2/6/t/med/261b1f39-12a1-47fb-aad3-0905c472490f.webp', // NCR Core
      'srpv39': 'https://media.nexusmods.com/9/b/t/med/9b4e7d24-fb71-4b90-9c3c-d7eb21c7a115.webp', // NCR Extras
      'vfy7w1': 'https://media.nexusmods.com/4/f/t/med/4f93ce82-4edb-4d55-baf3-cf63fad625b0.webp'  // NCR Body
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
