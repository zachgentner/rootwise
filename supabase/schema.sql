-- Run this in Supabase Dashboard → SQL Editor

-- ANCESTORS TABLE
CREATE TABLE IF NOT EXISTS ancestors (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  internal_id  INTEGER     NOT NULL,
  first        TEXT        DEFAULT '',
  middle       TEXT        DEFAULT '',
  surname      TEXT        DEFAULT '',
  maiden       TEXT        DEFAULT '',
  birth        TEXT        DEFAULT '',
  death        TEXT        DEFAULT '',
  ancestry     TEXT        DEFAULT '',
  familysearch TEXT        DEFAULT '',
  findagrave   TEXT        DEFAULT '',
  myheritage   TEXT        DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, internal_id)
);

ALTER TABLE ancestors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own ancestors"
  ON ancestors FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- USER SETTINGS TABLE
CREATE TABLE IF NOT EXISTS user_settings (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ancestry_tree_id  TEXT        DEFAULT '',
  ancestry_root     TEXT        DEFAULT '',
  myheritage_id     TEXT        DEFAULT '',
  myheritage_root   TEXT        DEFAULT '',
  familysearch_id   TEXT        DEFAULT '',
  findagrave_id     TEXT        DEFAULT '',
  autoload          BOOLEAN     DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER ancestors_updated_at
  BEFORE UPDATE ON ancestors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
