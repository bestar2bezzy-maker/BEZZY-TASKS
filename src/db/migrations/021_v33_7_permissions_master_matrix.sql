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
 
/*
 * ============================================================
 * ATTRIBUTION DES PERMISSIONS PAR RÔLE
 * ============================================================
 */

INSERT OR IGNORE INTO role_permissions
(role, permission, scope)
VALUES

/* ============================================================
 * USER
 * ============================================================
 */

('user', 'users.view_self', 'self'),
('user', 'tasks.view', 'global'),
('user', 'finance.view_self', 'self'),
('user', 'analytics.self', 'self'),

/* ============================================================
 * AMBASSADEUR
 * ============================================================
 */

('ambassadeur', 'users.view_self', 'self'),
('ambassadeur', 'tasks.view', 'global'),
('ambassadeur', 'finance.view_self', 'self'),
('ambassadeur', 'analytics.self', 'self'),
('ambassadeur', 'analytics.team', 'referral_network'),
('ambassadeur', 'roles.view', 'self'),
('ambassadeur', 'roles.view_progression', 'self'),

/* ============================================================
 * MODÉRATEUR
 * ============================================================
 */

('moderateur', 'users.view_self', 'self'),
('moderateur', 'users.view_all', 'moderation_scope'),
('moderateur', 'users.view_sensitive', 'moderation_scope'),
('moderateur', 'users.suspend', 'moderation_scope'),
('moderateur', 'users.unsuspend', 'own_actions'),
('moderateur', 'users.ban', 'moderation_scope'),

('moderateur', 'tasks.view', 'global'),
('moderateur', 'tasks.pause', 'moderation_scope'),

('moderateur', 'finance.view_self', 'self'),
('moderateur', 'finance.view_transactions', 'investigation_scope'),
('moderateur', 'finance.manage_withdrawals', 'review_only'),

('moderateur', 'moderation.view_reports', 'moderation_scope'),
('moderateur', 'moderation.handle_reports', 'moderation_scope'),
('moderateur', 'moderation.warn', 'moderation_scope'),
('moderateur', 'moderation.suspend', 'moderation_scope'),
('moderateur', 'moderation.ban', 'moderation_scope'),

('moderateur', 'analytics.self', 'self'),
('moderateur', 'analytics.team', 'moderation_scope'),
('moderateur', 'analytics.global', 'limited'),
('moderateur', 'analytics.role_performance', 'moderation_scope'),

('moderateur', 'roles.view', 'moderation_scope'),
('moderateur', 'roles.view_progression', 'moderation_scope'),
('moderateur', 'roles.manage_ambassadors', 'moderation_scope'),

('moderateur', 'system.manage_anti_fraud', 'review_only'),
('moderateur', 'system.view_audit_logs', 'moderation_scope'),

/* ============================================================
 * ADMINISTRATEUR
 * ============================================================
 */

('administrateur', 'users.view_self', 'self'),
('administrateur', 'users.view_all', 'global'),
('administrateur', 'users.view_sensitive', 'global'),
('administrateur', 'users.suspend', 'global'),
('administrateur', 'users.unsuspend', 'global'),
('administrateur', 'users.ban', 'global'),
('administrateur', 'users.unban', 'global'),

('administrateur', 'tasks.view', 'global'),
('administrateur', 'tasks.create', 'global'),
('administrateur', 'tasks.edit_own', 'global'),
('administrateur', 'tasks.edit_all', 'global'),
('administrateur', 'tasks.pause', 'global'),
('administrateur', 'tasks.delete', 'global'),
('administrateur', 'tasks.approve', 'global'),

('administrateur', 'finance.view_self', 'self'),
('administrateur', 'finance.view_all', 'global'),
('administrateur', 'finance.view_profit', 'global'),
('administrateur', 'finance.view_transactions', 'global'),
('administrateur', 'finance.manage_withdrawals', 'global'),
('administrateur', 'finance.approve_withdrawal', 'global'),
('administrateur', 'finance.refund', 'controlled'),

('administrateur', 'moderation.view_reports', 'global'),
('administrateur', 'moderation.handle_reports', 'global'),
('administrateur', 'moderation.warn', 'global'),
('administrateur', 'moderation.suspend', 'global'),
('administrateur', 'moderation.ban', 'global'),
('administrateur', 'moderation.reverse_action', 'controlled'),

('administrateur', 'analytics.self', 'self'),
('administrateur', 'analytics.team', 'global'),
('administrateur', 'analytics.global', 'global'),
('administrateur', 'analytics.financial', 'global'),
('administrateur', 'analytics.role_performance', 'global'),

('administrateur', 'roles.view', 'global'),
('administrateur', 'roles.view_progression', 'global'),
('administrateur', 'roles.manage_ambassadors', 'global'),
('administrateur', 'roles.manage_moderators', 'global'),

('administrateur', 'system.view_config', 'global'),
('administrateur', 'system.modify_config', 'operational_only'),
('administrateur', 'system.manage_anti_fraud', 'global'),
('administrateur', 'system.view_audit_logs', 'global'),

/* ============================================================
 * ELITE
 * ============================================================
 */

('elite', 'users.view_self', 'self'),
('elite', 'users.view_all', 'global'),
('elite', 'users.view_sensitive', 'global'),
('elite', 'users.suspend', 'global'),
('elite', 'users.unsuspend', 'global'),
('elite', 'users.ban', 'global'),
('elite', 'users.unban', 'global'),

('elite', 'tasks.view', 'global'),
('elite', 'tasks.create', 'global'),
('elite', 'tasks.edit_own', 'global'),
('elite', 'tasks.edit_all', 'global'),
('elite', 'tasks.pause', 'global'),
('elite', 'tasks.delete', 'global'),
('elite', 'tasks.approve', 'global'),

('elite', 'finance.view_self', 'self'),
('elite', 'finance.view_all', 'global'),
('elite', 'finance.view_profit', 'global'),
('elite', 'finance.view_transactions', 'global'),
('elite', 'finance.manage_withdrawals', 'global'),
('elite', 'finance.approve_withdrawal', 'global'),
('elite', 'finance.refund', 'controlled'),

('elite', 'moderation.view_reports', 'global'),
('elite', 'moderation.handle_reports', 'global'),
('elite', 'moderation.warn', 'global'),
('elite', 'moderation.suspend', 'global'),
('elite', 'moderation.ban', 'global'),
('elite', 'moderation.reverse_action', 'global'),

('elite', 'analytics.self', 'self'),
('elite', 'analytics.team', 'global'),
('elite', 'analytics.global', 'global'),
('elite', 'analytics.financial', 'global'),
('elite', 'analytics.role_performance', 'global'),

('elite', 'roles.view', 'global'),
('elite', 'roles.view_progression', 'global'),
('elite', 'roles.manage_ambassadors', 'global'),
('elite', 'roles.manage_moderators', 'global'),
('elite', 'roles.manage_admins', 'global'),
('elite', 'roles.modify_rules', 'global'),

('elite', 'system.view_config', 'global'),
('elite', 'system.modify_config', 'global'),
('elite', 'system.manage_roles', 'global'),
('elite', 'system.manage_anti_fraud', 'global'),
('elite', 'system.view_audit_logs', 'global');
