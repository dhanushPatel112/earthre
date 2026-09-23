CREATE TABLE IF NOT EXISTS uploads (
  id SERIAL PRIMARY KEY,
  original_filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_source_rows INTEGER NOT NULL DEFAULT 0,
  total_cleaned_rows INTEGER NOT NULL DEFAULT 0,
  total_duplicate_rows INTEGER NOT NULL DEFAULT 0,
  total_quality_issues INTEGER NOT NULL DEFAULT 0,
  dataset_start TIMESTAMPTZ,
  dataset_end TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_check_observations (
  id SERIAL PRIMARY KEY,
  upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id),
  timestamp TIMESTAMPTZ NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms NUMERIC,
  agent TEXT NOT NULL,
  region TEXT NOT NULL,
  is_available BOOLEAN NOT NULL,
  quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS uploads_active_idx ON uploads (is_active, status);
CREATE INDEX IF NOT EXISTS observations_upload_idx ON health_check_observations (upload_id);
CREATE INDEX IF NOT EXISTS observations_timestamp_idx ON health_check_observations (timestamp);
CREATE INDEX IF NOT EXISTS observations_service_timestamp_idx ON health_check_observations (service_id, timestamp);
