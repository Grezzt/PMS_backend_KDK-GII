-- =============================================================================
-- PostgreSQL Initialization Script
-- Dieksekusi otomatis saat container pertama kali dibuat
-- =============================================================================

-- Aktifkan extension uuid-ossp untuk generate UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Aktifkan extension pg_trgm untuk full-text search nantinya
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant privileges ke user
GRANT ALL PRIVILEGES ON DATABASE pms_db TO pms_user;

-- Log
DO $$
BEGIN
  RAISE NOTICE 'PostgreSQL PMS database initialized successfully.';
END $$;
