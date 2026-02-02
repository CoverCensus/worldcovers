# Create Test User for WorldCovers

## Test User Credentials

**Email:** `admin@worldcovers.test`  
**Password:** `TestAdmin123!`

## Method 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/shvnivsnyoitgkkngyqk
2. Navigate to **Authentication** → **Users**
3. Click **Add User** → **Create new user**
4. Enter:
   - **Email:** `admin@worldcovers.test`
   - **Password:** `TestAdmin123!`
   - **Auto Confirm User:** ✅ (checked)
5. Click **Create User**

## Method 2: Using SQL Editor

1. Go to Supabase Dashboard → **SQL Editor**
2. Run the following SQL script:

```sql
-- Create test user
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
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@worldcovers.test',
  crypt('TestAdmin123!', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW()
);
```

**Note:** This method requires admin/service_role access. If you get permission errors, use Method 1 instead.

## Method 3: Using Supabase CLI (if you have it set up)

```bash
supabase auth admin create-user \
  --email admin@worldcovers.test \
  --password TestAdmin123! \
  --email-confirm
```

## After Creating the User

1. Go to your app's login page: `http://localhost:8080/auth`
2. Sign in with:
   - Email: `admin@worldcovers.test`
   - Password: `TestAdmin123!`
3. You should now be able to access the Admin Dashboard and view login requests

## Security Note

⚠️ **Important:** This is a test account with a simple password. For production, use strong, unique passwords and consider implementing proper user management.
