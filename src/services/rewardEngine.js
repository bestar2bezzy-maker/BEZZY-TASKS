/*
 * ============================================================
 * BEZZY TASKS — REWARD ENGINE
 * V33.3
 * ============================================================
 *
 * Centralise le calcul de la récompense utilisateur.
 * La récompense ne doit jamais dépasser le montant payé par
 * le partenaire ni mettre en danger la marge minimale de Bezzy.
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

  return Math.min(
    Math.floor(rate),
    10000
  );
}


function calculateTaskReward(task) {

  const partnerPayout =
    toMinor(
      task?.partner_payout_minor
    );


  const rewardRateBps =
    toBps(
      task?.reward_rate_bps || 0
    );


  const minimumMargin =
    toMinor(
      task?.min_platform_margin_minor
    );


  /*
   * Récompense théorique selon le
   * pourcentage configuré.
   *
   * Exemple :
   *
   * 1500 FCFA × 20 %
   * = 300 FCFA
   */

  const theoreticalReward =
    Math.floor(
      partnerPayout *
      rewardRateBps /
      10000
    );


  /*
   * Plafond individuel.
   */

  const maxUserReward =
    task?.max_user_reward_minor == null
      ? partnerPayout
      : toMinor(
          task.max_user_reward_minor
        );


  /*
   * Protection de la marge minimale
   * de Bezzy.
   */

  const marginSafeReward =
    Math.max(
      0,
      partnerPayout -
      minimumMargin
    );


  /*
   * La récompense finale doit respecter
   * TOUTES les protections.
   */

  const userReward =
    Math.min(
      theoreticalReward,
      maxUserReward,
      partnerPayout,
      marginSafeReward
    );


  return {

    partner_payout_minor:
      partnerPayout,

    reward_rate_bps:
      rewardRateBps,

    theoretical_reward_minor:
      theoreticalReward,

    user_reward_minor:
      userReward,

    platform_margin_minor:
      partnerPayout -
      userReward,

    currency:
      task?.currency ||
      "XAF"

  };

}


module.exports = {
  calculateTaskReward
};
