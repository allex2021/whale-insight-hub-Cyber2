
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old schedule if present
DO $$ BEGIN
  PERFORM cron.unschedule('whale-alert-engine');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'whale-alert-engine',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b529e1f1-d4ff-451e-86c9-e71b00c1dc7a.lovable.app/api/public/cron/generate-alerts',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Z3Vhd2pxZm9tYnhpaWFjdWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjExNjksImV4cCI6MjA5NTAzNzE2OX0.VWpmKYUpWKPlfHPbz7mpxlIpTVEvfRo-C_Y8J_8gbPI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
