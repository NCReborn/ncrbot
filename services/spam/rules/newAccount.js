// services/spam/rules/newAccount.js

module.exports = function newAccountRule(member, config, triggeredRules) {
  if (!config.enabled) return { triggered: false };

  const accountAgeHours = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60));
  const isNew = accountAgeHours < (config.accountAgeDays * 24);

  if (!isNew) return { triggered: false };

  if (config.requiresOtherTrigger && triggeredRules.length === 0) {
    return { triggered: false };
  }

  return {
    triggered: true,
    ruleName: "New Account",
    score: 1,
    evidence: [],
    description: `Account <${config.accountAgeDays} days old (${accountAgeHours} hours)`
  };
};
