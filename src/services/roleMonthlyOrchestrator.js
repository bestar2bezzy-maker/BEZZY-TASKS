/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * ORCHESTRATEUR MENSUEL DE PROGRESSION DES RÔLES
 * ============================================================
 *
 * Ce service coordonne les différentes étapes du système
 * mensuel de progression des rôles.
 *
 * Il ne sera pas encore exécuté automatiquement.
 *
 * Le cron Render sera branché ultérieurement.
 *
 * ============================================================
 */

const {
  applyMonthlyRoleTransitions
} = require('./roleTransition');

const {
  runMonthlyRoleEvaluation
} = require('./roleMonthlyRunner');

/*
 * ============================================================
 * CALCUL DU MOIS PRÉCÉDENT
 * ============================================================
 */

function getPreviousMonth(year, month) {
  const currentYear = Number(year);
  const currentMonth = Number(month);

  if (
    !Number.isInteger(currentYear) ||
    !Number.isInteger(currentMonth) ||
    currentMonth < 1 ||
    currentMonth > 12
  ) {
    throw new Error('INVALID_PERIOD');
  }

  if (currentMonth === 1) {
    return {
      year: currentYear - 1,
      month: 12
    };
  }

  return {
    year: currentYear,
    month: currentMonth - 1
  };
}


/*
 * ============================================================
 * VÉRIFIER LE PREMIER JOUR DU MOIS
 * ============================================================
 */

function isFirstDayOfMonth(date = new Date()) {
  return date.getDate() === 1;
}


/*
 * ============================================================
 * EXÉCUTER L'OUVERTURE MENSUELLE
 * ============================================================
 *
 * Cette fonction est destinée à être appelée le premier jour
 * d'un nouveau mois.
 *
 * Exemple :
 *
 * 1er octobre 2026
 *      ↓
 * application des décisions de septembre 2026
 *
 * ============================================================
 */

function runMonthlyOpening(date = new Date()) {
  if (!isFirstDayOfMonth(date)) {
    throw new Error(
      'MONTHLY_OPENING_ONLY_ON_FIRST_DAY'
    );
  }

  const currentYear =
    date.getFullYear();

  const currentMonth =
    date.getMonth() + 1;

  const previousPeriod =
    getPreviousMonth(
      currentYear,
      currentMonth
    );

  const evaluationResult =
  runMonthlyRoleEvaluation(
    previousPeriod.year,
    previousPeriod.month
  );

const transitionResult =
  applyMonthlyRoleTransitions(
    previousPeriod.year,
    previousPeriod.month
  );
  return {
    success: true,

    currentYear,

    currentMonth,

    appliedEvaluationYear:
      previousPeriod.year,

    appliedEvaluationMonth:
      previousPeriod.month,

    transitionResult
  };
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  getPreviousMonth,
  isFirstDayOfMonth,
  runMonthlyOpening
};
