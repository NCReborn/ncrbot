// services/StreetCredSiteSnapshot.js
//
// Builds the leaderboard payload dispatched to the Preem-Team site by
// utils/siteStreetCredDispatcher.js. Split out from StreetCredService.js
// so it's independently testable without a live DB/Discord connection --
// pass in whatever getAllActive() and guild.members already give you.

const { getStaffRoleIds } = require('../utils/guildConfig');

const TOP_N = 50;

function resolveDisplayName(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.displayName : `Unknown (${userId})`;
}

function isStaffMember(guild, userId, staffRoleIds) {
  if (staffRoleIds.length === 0) return false;
  const member = guild.members.cache.get(userId);
  if (!member) return false;
  return staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

/**
 * @param {Guild} guild        Discord guild -- members should already be
 *   fetched/cached (caller's responsibility, same as the Discord command).
 * @param {Array} activeRows   Result of StreetCredService.getAllActive(guildId)
 *   -- [{ user_id, tier, effective_score, messages, status }, ...], already
 *   sorted by effective_score DESC.
 * @param {object} cfg         Result of StreetCredService.getGuildConfig(guildId).
 * @param {function} getTierLabel  StreetCredService.getTierLabel, passed in
 *   rather than required directly to keep this module dependency-light and
 *   easy to unit test with fakes.
 */
function buildLeaderboardPayload(guild, activeRows, cfg, getTierLabel) {
  const staffRoleIds = getStaffRoleIds(guild.id);

  return activeRows.slice(0, TOP_N).map((row, index) => ({
    rank: index + 1,
    display_name: resolveDisplayName(guild, row.user_id),
    tier_label: getTierLabel(row.tier, cfg),
    score: row.effective_score,
    is_staff: isStaffMember(guild, row.user_id, staffRoleIds)
  }));
}

module.exports = { buildLeaderboardPayload };
