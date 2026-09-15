CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
ON users(email)
WHERE email IS NOT NULL;
