const { getModeratorRoleIds } = require('./guildConfig');

class PermissionChecker {
  /**
   * Check if member has moderator role. Role IDs come from
   * config/moderatorRoles.json, keyed per guild -- was previously a
   * single hardcoded NCR-only role list, so every other guild's real
   * moderators (non-Administrator) were silently never recognized here.
   */
  static hasModRole(member) {
    if (!member) return false;

    if (member.permissions.has('Administrator')) {
      return true;
    }

    const roleIds = getModeratorRoleIds(member.guild?.id);
    return roleIds.some(roleId =>
      member.roles.cache.has(roleId)
    );
  }

  /**
   * Check if member has specific role
   */
  static hasRole(member, roleId) {
    if (!member) return false;
    return member.roles.cache.has(roleId);
  }

  /**
   * Check if member is admin
   */
  static isAdmin(member) {
    if (!member) return false;
    return member.permissions.has('Administrator');
  }
}

// Legacy export for backwards compatibility
function hasModRole(member) {
  return PermissionChecker.hasModRole(member);
}

module.exports = { hasModRole, PermissionChecker };
