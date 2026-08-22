function normalizePlan(p) {
  const n = String(p || 'Standard').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (n.includes('professional') || n === 'pro') return 'Professional';
  if (n.includes('indie')) return 'Indie Hacker';
  return 'Standard';
}

function normalizeBilling(planRaw, billing) {
  const n = String(planRaw || '').toLowerCase();
  if (n.includes('annual') || n.includes('$8')) return 'annual';
  const b = String(billing || 'monthly').toLowerCase();
  return b === 'annual' ? 'annual' : 'monthly';
}

function planLimits(user) {
  const plan = normalizePlan(user && user.plan);
  if (plan === 'Professional') {
    return { plan, billing: 'monthly', sites: Number.POSITIVE_INFINITY, projects: Number.POSITIVE_INFINITY };
  }
  if (plan === 'Indie Hacker') {
    return { plan, billing: 'monthly', sites: 5, projects: 5 };
  }
  const billing = normalizeBilling(user && user.plan, user && (user.billing_cycle || user.billingCycle));
  if (billing === 'annual') {
    return { plan: 'Standard', billing, sites: 2, projects: 2 };
  }
  return { plan: 'Standard', billing: 'monthly', sites: 1, projects: 1 };
}

async function loadUserPlan(userId) {
  const { query } = require('../config/database');
  const result = await query('SELECT id, email, name, plan, billing_cycle FROM users WHERE id = $1', [userId]);
  const row = (result.rows && result.rows[0]) || { plan: 'Standard', billing_cycle: 'monthly' };
  if (!row.plan) row.plan = 'Standard';
  if (!row.billing_cycle) row.billing_cycle = 'monthly';
  return row;
}

function limitPayload(kind, limits) {
  const max = kind === 'sites' ? limits.sites : limits.projects;
  if (limits.plan === 'Indie Hacker') {
    return {
      error: kind === 'sites'
        ? 'Indie Hacker plan allows 5 website domains. Upgrade to Professional for unlimited domains.'
        : 'Indie Hacker plan allows 5 website projects. Upgrade to Professional for unlimited projects.',
      code: 'PLAN_LIMIT',
      plan: limits.plan,
      limit: max
    };
  }
  return {
    error: 'you are in standard plan. Please upgrade first to host more domains.',
    code: 'PLAN_LIMIT',
    plan: limits.plan,
    limit: max
  };
}

function publicUser(user) {
  const limits = planLimits(user || {});
  return {
    id: user && user.id,
    email: user && user.email,
    name: user && user.name,
    plan: limits.plan,
    billing_cycle: limits.billing,
    billingCycle: limits.billing
  };
}

module.exports = {
  normalizePlan,
  normalizeBilling,
  planLimits,
  loadUserPlan,
  limitPayload,
  publicUser
};
