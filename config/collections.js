// Collection + grouping configuration for modular revision monitoring.
// NCR now uses a simple 3-collection system: Core, Extras, Body
// Subnautica 2 Reborn has its own collection
module.exports = {
  combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10),

  groups: [
    {
      name: 'NCR',
      displayName: 'NCR',
      channelId: process.env.NCR_CHANGELOG_CHANNEL_ID || '1285797113879334962',
      members: ['rcuccp', 'srpv39', 'vfy7w1'],
      template: 'ncr',
      gameVersion: '2.3',
      combined: true
    },
    {
      name: 'SUB2_REBORN',
      displayName: 'Subnautica 2 Reborn',
      channelId: process.env.SUB2_REBORN_CHANGELOG_CHANNEL_ID || '1285797113879334962',
      members: ['9htmlb'],
      template: 'sub2',
      gameVersion: '1.0'
    }
  ],

  collections: [
    { slug: 'rcuccp', display: 'NCR Core', group: 'NCR', priority: 1 },
    { slug: 'srpv39', display: 'NCR Extras', group: 'NCR', priority: 2 },
    { slug: 'vfy7w1', display: 'NCR Body', group: 'NCR', priority: 3 },
    { slug: '9htmlb', display: 'Subnautica 2 Reborn', group: 'SUB2_REBORN', priority: 1 }
  ],

  getCollection(slug) {
    return this.collections.find(c => c.slug === slug);
  },

  getGroup(groupName) {
    return this.groups.find(g => g.name === groupName);
  },

  getGroupForCollection(slug) {
    const collection = this.getCollection(slug);
    if (!collection) return null;
    return this.getGroup(collection.group);
  }
};
