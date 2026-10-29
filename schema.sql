CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(120) NOT NULL,
  slug VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(14, 2),
  category VARCHAR(50) NOT NULL,
  city VARCHAR(80) NOT NULL,
  condition VARCHAR(30) NOT NULL DEFAULT 'used',
  image_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'hidden', 'pending')),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id BIGINT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ad_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  ad_id BIGINT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(50) NOT NULL,
  details VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ads_active_created_idx ON ads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ads_category_idx ON ads (category, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ads_city_idx ON ads (city, status);
CREATE INDEX IF NOT EXISTS ads_price_idx ON ads (price) WHERE price IS NOT NULL;
CREATE INDEX IF NOT EXISTS ads_owner_idx ON ads (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_ad_idx ON reports (ad_id, created_at DESC);
