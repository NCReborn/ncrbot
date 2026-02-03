// Collection + grouping configuration for multi-collection revision monitoring.
// Adjust slugs and display names to match real Nexus collection identifiers.
module.exports = {
  combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '300000', 10),

  groups: [
    {
      name: 'FULL',
      displayName: 'NCR & ADR',
      channelId: process.env.FULL_GROUP_CHANNEL_ID || '1285797113879334962',
      members: ['rcuccp', 'srpv39'],
      template: 'ncr',
      gameVersion: '2.3',
      combined: true
    },
    {
      name: 'LITE',
      displayName: 'NCR Lite & ADR Lite',
      channelId: process.env.LITE_GROUP_CHANNEL_ID || '1387411802035585086',
      members: ['vfy7w1', 'ezxduq'],
      template: 'ncr',
      gameVersion: '2.3',
      combined: true
    },
    {
      name: 'EXPEDITION_33',
      displayName: 'Expedition 33',
      channelId: process.env.E33_GROUP_CHANNEL_ID || '1461274886281629902',
      members: ['jzmqt4'],
      template: 'e33',
      gameVersion: '1.5.1',
      combined: false
    }
  ],

  collections: [
    { slug: 'rcuccp', display: 'NCR', group: 'FULL', priority: 1 },
    { slug: 'srpv39', display: 'ADR', group: 'FULL', priority: 2 },
    { slug: 'vfy7w1', display: 'NCR Lite', group: 'LITE', priority: 1 },
    { slug: 'ezxduq', display: 'ADR Lite', group: 'LITE', priority: 2 },
    { slug: 'jzmqt4', display: 'Expedition 33', group: 'EXPEDITION_33', priority: 1 }
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
