-- Disposable test database only: approximate the public publication FK shape.
-- This is NOT a Vibress core migration or a substitute for populated upgrade tests.
CREATE TABLE public.publications (id text PRIMARY KEY);
INSERT INTO public.publications(id) VALUES ('pub-a'), ('pub-b');
