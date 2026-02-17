-- Create a test admin user for WorldCovers
-- Email: admin@worldcovers.test
-- Password: TestAdmin123!

-- Note: In Supabase, you need to use the Admin API or Dashboard to create users with passwords
-- This SQL script creates the user record, but you'll need to set the password via:
-- 1. Supabase Dashboard > Authentication > Users > Add User
-- 2. Or use the Supabase Admin API

-- Alternative: Use this in Supabase SQL Editor (requires service_role key or admin access)
-- The password will need to be hashed using bcrypt

-- Method 1: Using Supabase's auth schema (if you have admin access)
-- This requires the auth schema to be accessible and proper permissions

DO $$
DECLARE
  user_id uuid;
  user_email text := 'admin@worldcovers.test';
  user_password text := 'TestAdmin123!';
BEGIN
  -- Check if user already exists
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;
  
  -- If user doesn't exist, create it
  IF user_id IS NULL THEN
    -- Insert into auth.users
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
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
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      user_email,
      crypt(user_password, gen_salt('bf')),
      NOW(),
      NULL,
      NULL,
      '{"provider":"email","providers":["email"]}',
      '{}',
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO user_id;
    
    RAISE NOTICE 'User created with ID: %', user_id;
  ELSE
    RAISE NOTICE 'User already exists with ID: %', user_id;
  END IF;
END $$;

-- Note: The above may not work directly in SQL Editor due to RLS and auth schema restrictions
-- Recommended: Use Supabase Dashboard > Authentication > Users > Add User
-- Or use the Supabase Admin API with service_role key
