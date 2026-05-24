-- 1. Roles enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer helper (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. user_roles policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Broadcast channels (Telegram / Discord groups)
CREATE TABLE public.broadcast_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('telegram','discord')),
  -- Telegram: bot_token + chat_id; Discord: webhook_url
  bot_token TEXT,
  chat_id TEXT,
  webhook_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  min_confidence INTEGER NOT NULL DEFAULT 60,
  filter_assets TEXT[] DEFAULT NULL,         -- null = all coins
  filter_sides TEXT[] DEFAULT NULL,          -- null = both LONG/SHORT
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage broadcast channels"
ON public.broadcast_channels FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_broadcast_channels_updated_at
BEFORE UPDATE ON public.broadcast_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Broadcast signals history
CREATE TABLE public.broadcast_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES public.ai_signals(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.broadcast_channels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view broadcast history"
ON public.broadcast_signals FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_broadcast_signals_signal ON public.broadcast_signals(signal_id);
CREATE INDEX idx_broadcast_signals_channel ON public.broadcast_signals(channel_id);

-- 6. Auto-promote the first admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'allex2.0service@gmail.com'
ON CONFLICT DO NOTHING;