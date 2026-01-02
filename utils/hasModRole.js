// Returns true if the user is an administrator or has the Mod+ role
const MOD_ROLE_ID = '1370874936456908931';

function hasModRole(member) {
    return member.permissions.has('Administrator') || member.roles.cache.has(MOD_ROLE_ID);
}

module.exports = { hasModRole };
