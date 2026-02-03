const CONSTANTS = require('../config/constants');

class PermissionChecker {
  /**
   * Check if member has moderator role
   */
  static hasModRole(member) {
    if (!member) return false;
    
    if (member.permissions.has('Administrator')) {
      return true;
    }
    
    return CONSTANTS.ROLES.MODERATOR.some(roleId => 
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
