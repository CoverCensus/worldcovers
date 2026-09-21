-- Manual fallback for local setup. ./woco setup dev normally generates and
-- runs equivalent SQL for you.
--
-- Run once as MariaDB root (or another user with CREATE DATABASE and GRANT):
--   sudo mariadb < tools/setup_worldcovers_db.sql
--   # or, if root has a password: mariadb -u root -p < tools/setup_worldcovers_db.sql
-- Or from the mariadb client: source /path/to/tools/setup_worldcovers_db.sql

CREATE DATABASE IF NOT EXISTS worldcovers
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create the app user. EDIT THE PASSWORD before running this script, and put
-- the same password in mysql.cnf at the repo root. Create the user explicitly
-- before granting access to its databases.
CREATE USER IF NOT EXISTS 'wocod'@'localhost' IDENTIFIED BY 'CHANGE_ME_BEFORE_RUNNING';

-- Grant the same app user full access to the app and Django test databases.
-- Django uses test_${DB_NAME}; with the default DB_NAME=worldcovers, that is
-- test_worldcovers.
GRANT ALL PRIVILEGES ON worldcovers.* TO 'wocod'@'localhost';
GRANT ALL PRIVILEGES ON test_worldcovers.* TO 'wocod'@'localhost';
FLUSH PRIVILEGES;
