// utils/siteShowcaseDispatcher.js
//
// Fires a `repository_dispatch` event to the Preem-Team site repo when a
// #showcase post gets featured, mirroring utils/siteChangelogDispatcher.js.
// A GitHub Action there (.github/workflows/showcase-dispatch.yml) runs
// scripts/apply-showcase.js against the payload and pushes the result.

const logger = require("../logger"); // adjust path to match your existing logger

const SITE_OWNER = "mquiny";
const SITE_REPO = "Preem-Team";

/**
 * @param {object} payload
 * @param {string} payload.submission_id  Unique id for this post — use the
 *   Discord message ID. The site script is idempotent on this: firing twice
 *   for the same id is a safe no-op, it will not create a duplicate card.
 * @param {string} payload.image_url      Direct URL to the image (attachment
 *   URL or embed image URL). Required — the site skips anything without one.
 * @param {string} payload.username       Display name / tag to credit.
 * @param {string} payload.channel        e.g. "#showcase".
 * @param {string} payload.posted_at      ISO date string — used to bucket
 *   the post into the right month's section on the site.
 * @param {string} [payload.title]        Optional caption. Falls back to
 *   "Showcase submission" on the site if omitted.
 * @param {string} [payload.message_url]  Optional link back to the original
 *   Discord message — shown as "View original post" if provided.
 */
async function dispatchShowcaseToSite(payload) {
  const token = process.env.SITE_CHANGELOG_TOKEN; // same PAT already used for changelog dispatches — scoped to Contents: read/write on Preem-Team, reused here rather than adding a second secret
  if (!token) {
    logger.warn("[showcase] SITE_CHANGELOG_TOKEN not set — skipping site dispatch");
    return;
  }
  if (!payload.image_url || !payload.username || !payload.submission_id) {
    logger.warn("[showcase] Missing required field(s) — skipping site dispatch", payload);
    return;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${SITE_OWNER}/${SITE_REPO}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event_type: "showcase_submission",
        client_payload: payload
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(`[showcase] Site dispatch failed: ${res.status} ${text}`);
      return;
    }

    logger.info(`[showcase] Dispatched submission "${payload.submission_id}" to site`);
  } catch (err) {
    logger.warn("[showcase] Site dispatch threw:", err);
  }
}

module.exports = { dispatchShowcaseToSite };
