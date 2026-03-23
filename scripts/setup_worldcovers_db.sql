-- Run once as MySQL root (or another user with CREATE DATABASE and GRANT):
--   sudo mysql < scripts/setup_worldcovers_db.sql
--   # or, if root has a password: mysql -u root -p < scripts/setup_worldcovers_db.sql
-- Or from the mysql client: source /path/to/scripts/setup_worldcovers_db.sql

CREATE DATABASE IF NOT EXISTS worldcovers
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Grant the same app user full access to the new database (adjust user/host if needed)
GRANT ALL PRIVILEGES ON worldcovers.* TO 'wocod'@'localhost';
FLUSH PRIVILEGES;
