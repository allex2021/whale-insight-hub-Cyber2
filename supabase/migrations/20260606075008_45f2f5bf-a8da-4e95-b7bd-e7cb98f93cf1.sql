
-- Explicitly deny INSERT/UPDATE/DELETE on user_roles for authenticated users
CREATE POLICY "Deny authenticated insert on user_roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "Deny authenticated update on user_roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny authenticated delete on user_roles"
ON public.user_roles FOR DELETE TO authenticated
USING (false);

-- Allow service_role full management (bypasses RLS already, but explicit for clarity)
CREATE POLICY "Service role manages user_roles"
ON public.user_roles FOR ALL TO service_role
USING (true)
WITH CHECK (true);
