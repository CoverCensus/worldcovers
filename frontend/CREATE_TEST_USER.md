# Create Admin Test User for WorldCovers

## Admin Test User Credentials (distinct from any existing admin@worldcovers.test)

**Email:** `worldcovers-admin@worldcovers.test`  
**Password:** `WorldCoversAdmin123!`

## Method 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/shvnivsnyoitgkkngyqk
2. Navigate to **Authentication** → **Users**
3. Click **Add User** → **Create new user**
4. Enter:
   - **Email:** `worldcovers-admin@worldcovers.test`
   - **Password:** `WorldCoversAdmin123!`
   - **Auto Confirm User:** ✅ (checked)
5. Click **Create User**

## Method 2: Using SQL Editor

1. Go to Supabase Dashboard → **SQL Editor**
2. Run the following SQL script:

```sql
-- Create admin test user (distinct from admin@worldcovers.test)
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
  'worldcovers-admin@worldcovers.test',
  crypt('WorldCoversAdmin123!', gen_salt('bf')),
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
  --email worldcovers-admin@worldcovers.test \
  --password WorldCoversAdmin123! \
  --email-confirm
```

## Assign Admin Role (so they can manage catalogs from Dashboard)

After creating the user, assign the admin role so they can manage catalogs, review submissions, and handle users from **Dashboard** (`http://localhost:8080/dashboard`).

1. In Supabase Dashboard go to **SQL Editor**
2. Run (replace the email if you used a different one):

```sql
-- Assign admin role to the user (replace email if you used a different one)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'worldcovers-admin@worldcovers.test'
ON CONFLICT (user_id, role) DO NOTHING;
```

3. The user can now sign in at `/auth` and use **Dashboard** (`/dashboard`) to:
   - See **My Submissions** and the admin tabs: **All Submissions**, **Users**
   - Manage catalog records (view, delete)
   - Review and approve/reject all submissions
   - View user roles and login requests
   - No separate admin route is used; everything is in the Dashboard for admins.

## After Creating the User

1. Go to your app's login page: `http://localhost:8080/auth`
2. Sign in with:
   - Email: `worldcovers-admin@worldcovers.test`
   - Password: `WorldCoversAdmin123!`
3. Go to **Dashboard**: `http://localhost:8080/dashboard`
4. If you assigned the admin role (see above), you will see extra tabs: **All Submissions**, **Users** to manage submissions and users.

## Security Note

⚠️ **Important:** This is a test account with a simple password. For production, use strong, unique passwords and consider implementing proper user management.
