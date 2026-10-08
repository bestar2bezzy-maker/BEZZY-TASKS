/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * LIAISON DIRECTE PARRAIN → UTILISATEUR
 * ============================================================
 *
 * Permet de connaître directement l'utilisateur qui a parrainé
 * chaque compte.
 *
 * Cette relation servira au moteur de progression des rôles :
 *
 * USER
 *   ↓
 * AMBASSADEUR
 *   ↓
 * MODÉRATEUR
 *   ↓
 * ADMINISTRATEUR
 *   ↓
 * ELITE
 *
 * ============================================================
 */

ALTER TABLE users
ADD COLUMN referred_by_user_id TEXT;
