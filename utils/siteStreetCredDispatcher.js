// utils/siteStreetCredDispatcher.js
//
// Fires a `repository_dispatch` event to the Preem-Team site repo with a
// daily snapshot of the CPE guild's StreetCred leaderboard, mirroring
// siteChangelogDispatcher.js / siteShowcaseDispatcher.js /
// siteAutoresponderDispatcher.js. A GitHub Action there
// (.github/workflows/streetcred-dispatch.yml) runs
// scripts/apply-streetcred.js against the payload and publishes a
// read-only leaderboard page.

const logger = require("./logger");

const SITE_OWNER = "mquiny";
const SITE_REPO = "Preem-Team";

// Same reasoning as siteAutoresponderDispatcher.js: hardcode the one
// guild allowed to publish rather than trusting a shared/generic mapping.
const SITE_GUILD_ID = "1543366600525217802";

/**
 * @param {string} guildId   No-op for any guild other than SITE_GUILD_ID.
 * @param {Array}  entries   [{ rank, display_name, tier_label, score, is_staff }, ...]
 */
async function dispatchStreetCredToSite(guildId, entries) {
  if (guildId !== SITE_GUILD_ID) return;

  const token = process.env.SITE_CHANGELOG_TOKEN; // shared PAT, same as the other site dispatchers
  if (!token) {
    logger.warn("[streetcred] SITE_CHANGELOG_TOKEN not set — skipping site dispatch");
    return;
  }

  const payload = {
    guild_id: guildId,
    generated_at: new Date().toISOString(),
    entries: entries || []
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${SITE_OWNER}/${SITE_REPO}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event_type: "streetcred_snapshot",
        client_payload: payload
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(`[streetcred] Site dispatch failed: ${res.status} ${text}`);
      return;
    }

    logger.info(`[streetcred] Dispatched ${payload.entries.length} leaderboard entries to site`);
  } catch (err) {
    logger.warn("[streetcred] Site dispatch threw:", err);
  }
}

module.exports = { dispatchStreetCredToSite };
