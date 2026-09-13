ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN country_code TEXT NOT NULL DEFAULT 'CG';
ALTER TABLE users ADD COLUMN referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
ON users(phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_unique
ON users(referral_code) WHERE referral_code IS NOT NULL;
