// utils/siteChangelogDispatcher.js
const https = require('https');
const logger = require('./logger');

const SITE_OWNER = 'mquiny';
const SITE_REPO = 'Preem-Team';

/**
 * Fires a GitHub `repository_dispatch` event so the Preem-Team docs site
 * can turn this changelog into a real page. Gated by SITE_CHANGELOG_SLUGS
 * (comma-separated collection slugs allowed to push to the site) so only
 * the collections you actually want on the website trigger this — leave
 * it unset/empty to push nothing.
 */
function isSlugAllowed(slug) {
  const allowed = (process.env.SITE_CHANGELOG_SLUGS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return allowed.includes(slug);
}

async function dispatchChangelogToSite(payload, slug) {
  if (!isSlugAllowed(slug)) {
    logger.info(`[SITE CHANGELOG] Slug "${slug}" not in SITE_CHANGELOG_SLUGS — skipping website push`);
    return;
  }

  const token = process.env.SITE_CHANGELOG_TOKEN;
  if (!token) {
    logger.warn('[SITE CHANGELOG] SITE_CHANGELOG_TOKEN not set — skipping website push');
    return;
  }

  const body = JSON.stringify({
    event_type: 'changelog_update',
    client_payload: payload
  });

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${SITE_OWNER}/${SITE_REPO}/dispatches`,
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'ncrbot-changelog-dispatcher',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 204) {
          logger.info('[SITE CHANGELOG] Website dispatch sent successfully');
        } else {
          logger.error(`[SITE CHANGELOG] Dispatch failed (${res.statusCode}): ${data}`);
        }
        resolve();
      });
    });
    req.on('error', (err) => {
      logger.error('[SITE CHANGELOG] Dispatch request error:', err);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

module.exports = { dispatchChangelogToSite };
