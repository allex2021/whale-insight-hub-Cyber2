
-- Remove permissive ai_signals insert; server functions use admin client which bypasses RLS
DROP POLICY IF EXISTS "Auth users insert ai signals" ON public.ai_signals;

-- Restrict the SECURITY DEFINER trigger function to only the trigger
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
