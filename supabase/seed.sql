-- Seed data for local development

-- Create a test user in auth.users
INSERT INTO auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000000', 'admin@groupsmix.local', 'authenticated', now(), '{"provider":"email","providers":["email"]}', '{"name":"Local Admin"}')
ON CONFLICT (id) DO NOTHING;

-- Create the public.users profile
INSERT INTO public.users (id, email, name, role)
VALUES ('00000000-0000-0000-0000-000000000000', 'admin@groupsmix.local', 'Local Admin', 'admin')
ON CONFLICT (id) DO NOTHING;

-- Create some mock groups
INSERT INTO public.groups (id, name, platform, category, country, language, description, created_by)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Tech Startup Founders', 'whatsapp', 'tech', 'us', 'en', 'A community for tech founders to share insights.', '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'Freelance Designers', 'discord', 'design', 'global', 'en', 'Share your portfolio and find freelance gigs.', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
