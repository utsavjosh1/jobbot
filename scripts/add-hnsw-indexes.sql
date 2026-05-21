-- ============================================================================
-- HNSW Vector Index Migration for Postly
-- ============================================================================
-- Purpose: Add HNSW indexes to all embedding columns for fast approximate
--          nearest neighbor (ANN) search. Without these, pgvector performs
--          a full sequential scan for every similarity query.
--
-- Safety:  CONCURRENTLY ensures NO table locks — reads and writes continue
--          uninterrupted during index creation. Can be run on a live database.
--
-- Performance Notes:
--   - m = 16:               good balance of recall vs. index size
--   - ef_construction = 64: higher = better recall, slower build
--   - Build time: ~1-5 min per 100k rows depending on VPS CPU
--   - CPU will spike during build — run during low-traffic hours
--
-- Usage:
--   docker exec -i postgres psql -U postly -d postly < scripts/add-hnsw-indexes.sql
--   (shared PostgreSQL container from monitoring stack)
--
-- Rollback:
--   DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_embedding_hnsw;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_resumes_embedding_hnsw;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_seeker_profiles_embedding_hnsw;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_employer_profiles_embedding_hnsw;
-- ============================================================================

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- Jobs table — primary vector search target for job matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_embedding_hnsw
  ON jobs USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Resumes table — used for resume-to-job matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resumes_embedding_hnsw
  ON resumes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Seeker profiles — used for employer-side candidate search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_seeker_profiles_embedding_hnsw
  ON seeker_profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Employer profiles — used for matching employers to seekers
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employer_profiles_embedding_hnsw
  ON employer_profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Verification: List all HNSW indexes
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE indexdef LIKE '%hnsw%'
ORDER BY tablename;
