
-- Whale trades (public read, server writes)
CREATE TABLE public.whale_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  size_usd NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'binance',
  trade_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_whale_trades_time ON public.whale_trades(trade_time DESC);
CREATE INDEX idx_whale_trades_asset ON public.whale_trades(asset, trade_time DESC);
ALTER TABLE public.whale_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read whale trades" ON public.whale_trades FOR SELECT USING (true);

-- AI signals (public read, server writes)
CREATE TABLE public.ai_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT','NEUTRAL')),
  entry NUMERIC,
  target NUMERIC,
  stop NUMERIC,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  timeframe TEXT NOT NULL DEFAULT '4H',
  reasoning TEXT,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_signals_time ON public.ai_signals(created_at DESC);
ALTER TABLE public.ai_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read ai signals" ON public.ai_signals FOR SELECT USING (true);

-- User settings (private)
CREATE TABLE public.user_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whale_min_usd NUMERIC NOT NULL DEFAULT 1000000,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  enable_alerts BOOLEAN NOT NULL DEFAULT true,
  watchlist TEXT[] NOT NULL DEFAULT ARRAY['BTC','ETH','SOL'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Alerts log (private per user)
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  asset TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','danger')),
  message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_user ON public.alerts(user_id, created_at DESC);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own alerts" ON public.alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own alerts" ON public.alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
