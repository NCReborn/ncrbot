// services/spam/rules/newAccount.js

module.exports = function newAccountRule(member, config = {}, triggeredRules = []) {
  if (!config?.enabled) return { triggered: false };
  if (!member?.user?.createdTimestamp) return { triggered: false };

  const accountAgeHours = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60));
  const ageDays = config.accountAgeDays || 7;
  const isNew = accountAgeHours < (ageDays * 24);

  if (!isNew) return { triggered: false };

  if (config.requiresOtherTrigger && triggeredRules.length === 0) {
    return { triggered: false };
  }

  return {
    triggered: true,
    ruleName: "New Account",
    score: 1,
    evidence: [],
    description: `Account <${ageDays} days old (${accountAgeHours} hours)`
  };
};
