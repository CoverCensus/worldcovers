-- ============================================
-- CREATE ADMIN TEST USER FOR WORLDCOVERS
-- ============================================
-- 
-- CREDENTIALS (distinct from existing admin@worldcovers.test):
-- Email: worldcovers-admin@worldcovers.test
-- Password: WorldCoversAdmin123!
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Paste and run this script
-- 3. If you get permission errors, use the Dashboard method instead:
--    Dashboard > Authentication > Users > Add User
-- ============================================

-- Option 1: Try this first (may require service_role access)
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Generate a new UUID for the user
  new_user_id := gen_random_uuid();
  
  -- Insert the user into auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'worldcovers-admin@worldcovers.test',
    crypt('WorldCoversAdmin123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (email) DO NOTHING;
  
  RAISE NOTICE 'User created successfully!';
  RAISE NOTICE 'Email: worldcovers-admin@worldcovers.test';
  RAISE NOTICE 'Password: WorldCoversAdmin123!';
  RAISE NOTICE 'User ID: %', new_user_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error: %', SQLERRM;
    RAISE NOTICE 'If you see permission errors, use the Supabase Dashboard method instead.';
    RAISE NOTICE 'Go to: Dashboard > Authentication > Users > Add User';
END $$;

-- Verify the user was created
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = 'worldcovers-admin@worldcovers.test';
