
CREATE INDEX IF NOT EXISTS idx_alerts_user_created ON public.alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whale_trades_time ON public.whale_trades(trade_time DESC);
