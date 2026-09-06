// utils/siteAutoresponderDispatcher.js
//
// Fires a `repository_dispatch` event to the Preem-Team site repo whenever
// this guild's auto-responses change, mirroring
// utils/siteChangelogDispatcher.js / siteShowcaseDispatcher.js. A GitHub
// Action there (.github/workflows/autoresponder-dispatch.yml) runs
// scripts/apply-autoresponders.js against the payload and pushes a
// read-only reference page -- the site only ever displays the list, it
// has no way to add/edit/run anything.
//
// Always sends the CPE guild's *complete current list* (not a diff), same
// approach sync-issues.js and apply-showcase.js use -- simpler than trying
// to reconcile incremental add/edit/delete events, and self-correcting if
// a dispatch is ever missed.

const logger = require("./logger");

const SITE_OWNER = "mquiny";
const SITE_REPO = "Preem-Team";

// Only the CPE guild's auto-responses are meant to be public reference on
// the Preem-Team site -- other guilds' (e.g. NCR's) are a different
// community's internal shortcuts and should never appear there. Hardcoded
// here rather than driven by a shared/generic per-guild mapping on
// purpose -- SnapMaster picked up cross-guild data exactly that way, via
// SHOWCASE_CHANNEL_IDS being reused for an unrelated feature. This
// dispatcher only ever knows about one guild, full stop.
const SITE_GUILD_ID = "1543366600525217802";

/**
 * @param {string} guildId         Guild the change happened in -- dispatch
 *   is a no-op for any guild other than SITE_GUILD_ID.
 * @param {Array} responses        This guild's full current auto-response
 *   list (the array already stored for it in data/autoResponses.json).
 */
async function dispatchAutorespondersToSite(guildId, responses) {
  if (guildId !== SITE_GUILD_ID) return;

  const token = process.env.SITE_CHANGELOG_TOKEN; // same PAT already used for changelog/showcase dispatches
  if (!token) {
    logger.warn("[autoresponder] SITE_CHANGELOG_TOKEN not set — skipping site dispatch");
    return;
  }

  const payload = {
    guild_id: guildId,
    responses: (responses || []).map((r) => ({
      trigger: r.trigger,
      response: r.response,
      wildcard: Boolean(r.wildcard),
      allowed_channel_ids: Array.isArray(r.allowedChannelIds) ? r.allowedChannelIds : []
    }))
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
        event_type: "autoresponder_update",
        client_payload: payload
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(`[autoresponder] Site dispatch failed: ${res.status} ${text}`);
      return;
    }

    logger.info(`[autoresponder] Dispatched ${payload.responses.length} response(s) to site`);
  } catch (err) {
    logger.warn("[autoresponder] Site dispatch threw:", err);
  }
}

module.exports = { dispatchAutorespondersToSite };
