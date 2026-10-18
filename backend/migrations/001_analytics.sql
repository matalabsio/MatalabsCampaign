BEGIN;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE TABLE IF NOT EXISTS analytics.sites (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO analytics.sites(id, name) VALUES ('matalabs-campaign', 'MATA Labs Director Profile') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS analytics.sessions (
  id uuid PRIMARY KEY,
  site_id text NOT NULL REFERENCES analytics.sites(id),
  visitor_id uuid NOT NULL,
  origin text NOT NULL,
  opened_at timestamptz NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text NOT NULL DEFAULT '',
  share_tag text,
  last_seq bigint NOT NULL DEFAULT 0,
  elapsed_ms bigint NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  viewing_ms bigint NOT NULL DEFAULT 0 CHECK (viewing_ms >= 0 AND viewing_ms <= elapsed_ms),
  UNIQUE(site_id, id)
);
CREATE INDEX IF NOT EXISTS sessions_site_time ON analytics.sessions(site_id, unlocked_at DESC);
CREATE TABLE IF NOT EXISTS analytics.slide_timings (
  site_id text NOT NULL,
  session_id uuid NOT NULL,
  slide integer NOT NULL CHECK (slide >= 0),
  viewing_ms bigint NOT NULL CHECK (viewing_ms >= 0),
  PRIMARY KEY(site_id, session_id, slide),
  FOREIGN KEY(site_id,session_id) REFERENCES analytics.sessions(site_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS analytics.events (
  site_id text NOT NULL,
  session_id uuid NOT NULL,
  id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('slide_view','link_click')),
  slide integer NOT NULL CHECK (slide >= 0),
  at_ms bigint NOT NULL CHECK (at_ms >= 0),
  link_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(site_id, session_id, id),
  FOREIGN KEY(site_id,session_id) REFERENCES analytics.sessions(site_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS events_site_time ON analytics.events(site_id, received_at DESC);
COMMIT;
