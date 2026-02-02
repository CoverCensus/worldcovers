-- Add fields shown on Submission Detail so Contributor Dashboard can collect them
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS manuscript text,
  ADD COLUMN IF NOT EXISTS rarity text;
