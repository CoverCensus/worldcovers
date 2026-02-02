-- Create catalog_records table
CREATE TABLE public.catalog_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  town TEXT NOT NULL,
  date_range TEXT NOT NULL,
  color TEXT NOT NULL,
  type TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.catalog_records ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (catalog is public)
CREATE POLICY "Catalog records are viewable by everyone" 
ON public.catalog_records 
FOR SELECT 
USING (true);

-- Create indexes for common filters
CREATE INDEX idx_catalog_state ON public.catalog_records(state);
CREATE INDEX idx_catalog_town ON public.catalog_records(town);
CREATE INDEX idx_catalog_type ON public.catalog_records(type);
CREATE INDEX idx_catalog_color ON public.catalog_records(color);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_catalog_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_catalog_records_updated_at
BEFORE UPDATE ON public.catalog_records
FOR EACH ROW
EXECUTE FUNCTION public.update_catalog_records_updated_at();