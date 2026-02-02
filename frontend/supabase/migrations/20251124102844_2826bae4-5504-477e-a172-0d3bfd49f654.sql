-- Create login_requests table
CREATE TABLE public.login_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  salutation text,
  country text NOT NULL,
  email text NOT NULL,
  phone_number text,
  organization text,
  comments text,
  status text NOT NULL DEFAULT 'pending'
);

-- Enable RLS
ALTER TABLE public.login_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert login requests
CREATE POLICY "Anyone can submit login requests"
ON public.login_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only allow authenticated users to view all requests
CREATE POLICY "Authenticated users can view login requests"
ON public.login_requests
FOR SELECT
TO authenticated
USING (true);

-- Create submissions table for catalog contributions
CREATE TABLE public.submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  submitter_name text,
  name text NOT NULL,
  state text NOT NULL,
  town text NOT NULL,
  date_range text NOT NULL,
  color text NOT NULL,
  type text NOT NULL,
  description text,
  citation_references text,
  image_url text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view their own submissions"
ON public.submissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own submissions
CREATE POLICY "Users can insert their own submissions"
ON public.submissions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Authenticated users can view all submissions (for review queue)
CREATE POLICY "Authenticated users can view all submissions for review"
ON public.submissions
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can update submissions (for review actions)
CREATE POLICY "Authenticated users can update submissions for review"
ON public.submissions
FOR UPDATE
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_submissions_updated_at
BEFORE UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_catalog_records_updated_at();