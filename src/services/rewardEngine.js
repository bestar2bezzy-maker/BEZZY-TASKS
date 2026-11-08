
/*
 * ============================================================
 * BEZZY TASKS — REWARD ENGINE
 * V34.0
 * ============================================================
 *
 * Deux modèles :
 * PARTNER_SHARE   : financement partenaire.
 * INTERNAL_BUDGET: financement Bezzy Tasks.
 */

function toMinor(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.floor(amount);
}

function toBps(value) {
  const rate = Number(value);

  if (!Number.isFinite(rate) || rate < 0) {
    return 0;
  }

  return Math.min(Math.floor(rate), 10000);
}

function calculateTaskReward(task) {
  const rewardModel = String(
    task?.reward_model || 'PARTNER_SHARE'
  ).trim().toUpperCase();

  const currency = task?.currency || 'XAF';

  const maxUserReward =
    task?.max_user_reward_minor == null
      ? null
      : toMinor(task.max_user_reward_minor);

  /*
   * MODÈLE 1 : TÂCHES INTERNES BEZZY
   * La récompense provient du budget de la plateforme.
   */
  if (rewardModel === 'INTERNAL_BUDGET') {
    const internalBudget = toMinor(task?.reward_minor);

    const userReward = Math.min(
      internalBudget,
      maxUserReward == null
        ? internalBudget
        : maxUserReward
    );

    return {
      reward_model: rewardModel,
      partner_payout_minor: 0,
      reward_rate_bps: 0,
      theoretical_reward_minor: internalBudget,
      user_reward_minor: userReward,
      platform_margin_minor: 0,
      currency
    };
  }

  /*
   * MODÈLE 2 : TÂCHES PARTENAIRES
   * La récompense dépend du financement partenaire.
   */
  if (rewardModel !== 'PARTNER_SHARE') {
    throw new Error(`UNSUPPORTED_REWARD_MODEL: ${rewardModel}`);
  }

  const partnerPayout = toMinor(
    task?.partner_payout_minor
  );

  const rewardRateBps = toBps(
    task?.reward_rate_bps || 0
  );

  const minimumMargin = toMinor(
    task?.min_platform_margin_minor
  );

  const theoreticalReward = Math.floor(
    partnerPayout * rewardRateBps / 10000
  );

  const userRewardCap =
    maxUserReward == null
      ? partnerPayout
      : maxUserReward;

  const marginSafeReward = Math.max(
    0,
    partnerPayout - minimumMargin
  );

  const userReward = Math.min(
    theoreticalReward,
    userRewardCap,
    partnerPayout,
    marginSafeReward
  );

  return {
    reward_model: rewardModel,
    partner_payout_minor: partnerPayout,
    reward_rate_bps: rewardRateBps,
    theoretical_reward_minor: theoreticalReward,
    user_reward_minor: userReward,
    platform_margin_minor: partnerPayout - userReward,
    currency
  };
}

module.exports = {
  calculateTaskReward
};
  
