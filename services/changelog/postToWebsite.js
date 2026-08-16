const fetch = require('node-fetch');

async function postChangelogToWebsite(groupConfig, revisionData) {
  const url = process.env.NCR_CHANGELOG_WEBHOOK;
  const token = process.env.NCR_CHANGELOG_TOKEN;

  if (!url || !token) {
    console.error('[CHANGELOG] Website webhook not configured');
    return;
  }

  const collection = revisionData.collections[0];
  const diffs = revisionData.diffs;

  const payload = {
    collection: collection.display,
    slug: collection.slug,
    revision: collection.newRev,
    game_version: groupConfig.gameVersion,
    posted_at: new Date().toISOString(),
    sections: {
      added: diffs.added?.map(m => m.name) || [],
      updated: diffs.updated?.map(m => ({
        name: m.before.name,
        from: m.before.version,
        to: m.after.version,
        domain: m.before.domainName,
        modId: m.before.modId
      })) || [],
      removed: diffs.removed?.map(m => m.name) || []
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NCR-Token': token
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error(`[CHANGELOG] Website rejected changelog: ${res.status}`);
    } else {
      console.log('[CHANGELOG] Synced changelog to website');
    }
  } catch (err) {
    console.error('[CHANGELOG] Failed to sync changelog to website:', err);
  }
}

module.exports = postChangelogToWebsite;
