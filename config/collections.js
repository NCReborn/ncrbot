// Collection + grouping configuration for modular revision monitoring.
// NCR now uses a simple 3-collection system: Core, Extras, Body
// Subnautica 2 Reborn has its own collection
module.exports = {
  combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10),

  groups: [
    {
      name: 'NCR_CORE',
      displayName: 'NCR Core',
      channelId: process.env.NCR_CORE_CHANGELOG_CHANNEL_ID || '1285797113879334962',
      members: ['rcuccp'],
      template: 'ncr',
      gameVersion: '2.3'
    },
    {
      name: 'NCR_EXTRAS',
      displayName: 'NCR Extras',
      channelId: process.env.NCR_EXTRAS_CHANGELOG_CHANNEL_ID || '1285797113879334962',
      members: ['srpv39'],
      template: 'ncr',
      gameVersion: '2.3'
    },
    {
      name: 'NCR_BODY',
      displayName: 'NCR Body',
      channelId: process.env.NCR_BODY_CHANGELOG_CHANNEL_ID || '1285797113879334962',
      members: ['vfy7w1'],
      template: 'ncr',
      gameVersion: '2.3'
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
    { slug: 'rcuccp', display: 'NCR Core', group: 'NCR_CORE', priority: 1 },
    { slug: 'srpv39', display: 'NCR Extras', group: 'NCR_EXTRAS', priority: 1 },
    { slug: 'vfy7w1', display: 'NCR Body', group: 'NCR_BODY', priority: 1 },
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
