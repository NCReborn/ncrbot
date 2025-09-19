// Collection + grouping configuration for multi-collection revision monitoring.
// Adjust slugs and display names to match real Nexus collection identifiers.
module.exports = {
  combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '300000', 10), // 5 minutes
  groups: [
    {
      name: 'FULL',
      channelId: process.env.FULL_GROUP_CHANNEL_ID || '1285797113879334962',
      members: ['rcuccp', 'srpv39']
    },
    {
      name: 'LITE',
      channelId: process.env.LITE_GROUP_CHANNEL_ID || '1387411802035585086',
      members: ['vfy7w1', 'ezxduq']
    }
  ],
  // Master list of tracked collections.
  collections: [
    { slug: 'rcuccp', display: 'NCR' },
    { slug: 'srpv39', display: 'ADR' },
    { slug: 'vfy7w1', display: 'NCR Lite' },
    { slug: 'ezxduq', display: 'ADR Lite' }
  ]
};
