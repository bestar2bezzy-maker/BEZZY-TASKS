/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * MATRICE MAÎTRE DES PERMISSIONS
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS permission_catalog (
  permission TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (role, permission),

  FOREIGN KEY (permission)
    REFERENCES permission_catalog(permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role
ON role_permissions(role);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission
ON role_permissions(permission);

INSERT OR IGNORE INTO permission_catalog
(permission, description, is_sensitive)
VALUES
('users.view_self', 'Voir son propre profil', 0),
('users.view_all', 'Voir les utilisateurs', 0),
('users.view_sensitive', 'Voir les données nécessaires à la modération', 1),
('users.suspend', 'Suspendre un utilisateur', 1),
('users.unsuspend', 'Lever une suspension', 1),
('users.ban', 'Bannir un utilisateur', 1),
('users.unban', 'Lever un bannissement', 1),
('users.delete', 'Supprimer logiquement un utilisateur', 1),

('tasks.view', 'Consulter les missions', 0),
('tasks.create', 'Créer une mission', 0),
('tasks.edit_own', 'Modifier ses propres missions', 0),
('tasks.edit_all', 'Modifier les missions', 1),
('tasks.pause', 'Mettre une mission en pause', 1),
('tasks.delete', 'Désactiver une mission', 1),
('tasks.approve', 'Approuver une mission', 1),

('finance.view_self', 'Voir ses propres données financières', 0),
('finance.view_all', 'Voir les finances globales', 1),
('finance.view_profit', 'Voir les bénéfices', 1),
('finance.view_transactions', 'Voir les transactions', 1),
('finance.manage_withdrawals', 'Gérer les demandes de retrait', 1),
('finance.approve_withdrawal', 'Valider ou refuser un retrait', 1),
('finance.refund', 'Effectuer un remboursement', 1),

('moderation.view_reports', 'Voir les signalements', 1),
('moderation.handle_reports', 'Traiter les signalements', 1),
('moderation.warn', 'Avertir un utilisateur', 1),
('moderation.suspend', 'Suspendre dans le cadre de la modération', 1),
('moderation.ban', 'Bannir dans le cadre de la modération', 1),
('moderation.reverse_action', 'Annuler une action de modération', 1),

('analytics.self', 'Voir ses statistiques', 0),
('analytics.team', 'Voir les statistiques de son équipe ou réseau', 0),
('analytics.global', 'Voir les statistiques globales', 1),
('analytics.financial', 'Voir les statistiques financières', 1),
('analytics.role_performance', 'Voir les performances des rôles', 1),

('roles.view', 'Voir les rôles', 0),
('roles.view_progression', 'Voir la progression des rôles', 0),
('roles.manage_ambassadors', 'Gérer les ambassadeurs', 1),
('roles.manage_moderators', 'Gérer les modérateurs', 1),
('roles.manage_admins', 'Gérer les administrateurs', 1),
('roles.modify_rules', 'Modifier les règles de progression des rôles', 1),

('system.view_config', 'Voir la configuration système', 1),
('system.modify_config', 'Modifier la configuration opérationnelle', 1),
('system.manage_roles', 'Gérer la configuration des rôles', 1),
('system.manage_anti_fraud', 'Gérer le système anti-fraude', 1),
('system.view_audit_logs', 'Consulter les journaux d audit', 1);
