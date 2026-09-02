// services/spam/rules/newAccount.js

const { RULE_DEFAULTS } = require('../spamConfigResolver');

module.exports = function newAccountRule(member, config = {}, triggeredRules = []) {
  if (!config || config.enabled !== true) return { triggered: false };
  if (!member?.user?.createdTimestamp) return { triggered: false };

  const ruleConfig = { ...RULE_DEFAULTS.newAccountMonitoring, ...config };
  const accountAgeHours = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60));
  const ageDays = Number(ruleConfig.accountAgeDays ?? RULE_DEFAULTS.newAccountMonitoring.accountAgeDays);
  const isNew = accountAgeHours < (ageDays * 24);

  if (!isNew) return { triggered: false };

  if (ruleConfig.requiresOtherTrigger && triggeredRules.length === 0) {
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
