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
        "**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1400942550076100811>\n\n" +
        "**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n" +
        "**⚠️ Important** - If you encounter any redscript errors please see the recommendations in <#1411463524017770580> as it can sometimes be a simple case of a dependency that hasn't installed properly.\n\n" +
        "**⚠️ Important** - Any fallback installer errors you come across, just select \"Yes, install to staging anyway\" every time you see it.\n\n" +
        "Any issues with updating please refer to <#1400940644565782599> & <#1285797091750187039>\n\n" +
        "If you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>"
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
        "If you run into any popups during installation check these threads <#1400942550076100811> or <#1411463524017770580>\n\n" +
        "If you run into fallback messages just select \"Yes, install to staging anyway\" <#1400942550076100811>"
      )
      .setColor(this.getColor('warning'));

    embeds.push(headerEmbed, updateEmbed);
    return embeds;
  }
}

module.exports = NCRTemplate;
