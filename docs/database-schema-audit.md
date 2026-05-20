# Postly Database Schema — Quality & Strictness Audit

> **Audit Date:** 2026-05-20  
> **Scope:** `packages/database/src/schema.ts`  
> **Benchmark Against:** All product requirements (auth roles, token pricing, resumes, scraping, applications, AI chat, bot configs, subscriptions, notifications, audit)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Requirement Coverage Map](#2-requirement-coverage-map)
3. [Table-by-Table Audit](#3-table-by-table-audit)
   - 3.1 Users & Auth
   - 3.2 Profiles (Seeker / Employer)
   - 3.3 Resumes
   - 3.4 Jobs
   - 3.5 Job Matches
   - 3.6 Applications
   - 3.7 AI Conversations
   - 3.8 Bots & Social
   - 3.9 Billing (Subscriptions & Payments)
   - 3.10 Notifications
   - 3.11 System (Audit, Token Usage)
   - 3.12 Relations
4. [Critical Issues Found](#4-critical-issues-found)
5. [Data Integrity & Strictness Gaps](#5-data-integrity--strictness-gaps)
6. [Performance & Indexing Gaps](#6-performance--indexing-gaps)
7. [Recommended Schema Changes](#7-recommended-schema-changes)
8. [Edge Cases & Security Considerations](#8-edge-cases--security-considerations)

---

## 1. Executive Summary

**Overall Score: 7.5 / 10** — Solid foundation with well-normalized tables and good use of PostgreSQL features (pgvector, enums, JSONB, relations). However, there are **8 critical gaps**, **12 moderate issues**, and several missing indexes that will cause problems at scale or at security review time.

| Domain | Score | Key Gaps |
|--------|-------|----------|
| Auth & Users | 8/10 | No refresh token storage, OTP cleanup TTL |
| Profiles | 9/10 | Seeker embedding unused, missing `updated_at` on seeker |
| Resumes | 8/10 | Missing file hash, file size, content-type tracking |
| Jobs | 8/10 | Weak source enum, missing company logo URL, no `is_remote` index |
| Applications | 7/10 | Ambiguous `notes` field, no email notification trigger |
| AI Chat | 7/10 | No message versioning table, missing `updated_at` |
| Bots | 6/10 | **Redundant `discord_configs`**, fragile CSV filter fields, credentials stored in plain JSONB |
| Billing | 7/10 | Missing trial tracking, no plan-feature mapping table, amount unit ambiguity |
| Notifications | 7/10 | No email template table, no batch tracking |
| System | 6/10 | `audit_log` lacks `details` JSONB, `token_usage` missing quota enforcement |

---

## 2. Requirement Coverage Map

| # | Requirement | Tables Involved | Status | Notes |
|---|-------------|-----------------|--------|-------|
| R1 | User registers as seeker OR employer (different UI) | `users`, `seeker_profiles`, `employer_profiles` | ✅ | Roles array supports multiple roles, profiles are separate tables |
| R2 | Token-based pricing (AI chat costs tokens) | `token_usage`, `subscriptions` | ⚠️ | **Tracks usage but has no quota enforcement** — no `tokens_allocated` column on subscriptions |
| R3 | Upload resume → AI analysis → job suggestions | `resumes`, `job_matches`, `conversations` | ✅ | Full pipeline present with embedding, parsed text, match scoring |
| R4 | Scrape jobs from internet → store efficiently | `jobs` | ✅ | Fingerprint dedup, source tracking, embedding for vector search |
| R5 | Application tracking with status updates | `applications`, `application_status_history` | ✅ | Full lifecycle with history trail |
| R6 | Applications only for platform-created jobs | `jobs.employer_id` nullable | ✅ | `employer_id IS NOT NULL` → platform job |
| R7 | AI chat with proper data management | `conversations`, `messages`, `system_prompts` | ✅ | Messages linked to conversations with token tracking |
| R8 | Paid users connect bots (Discord/Reddit/Twitter) | `bot_configs`, `bot_posts`, `discord_configs` | ❌ | **`discord_configs` is redundant** — `bot_configs` already covers all platforms |
| R9 | Bot niche filtering (e.g., engineering only) | `bot_configs.filters_*` | ⚠️ | CSV strings are fragile; should be array/JSONB for proper querying |
| R10 | Dodo Payments subscriptions | `subscriptions`, `payments` | ⚠️ | Missing trial tracking, no plan-feature definitions table |
| R11 | Notifications (email) | `notifications` | ✅ | Status-tracking with error capture |
| R12 | Audit logging | `audit_log` | ⚠️ | Missing `details` (before/after snapshots), no `ip_address` |
| R13 | Token usage tracking & rate limiting | `token_usage` | ⚠️ | No per-plan quota, no reset window tracking |

---

## 3. Table-by-Table Audit

### 3.1 Users & Auth

**Tables:** `users`, `sessions`, `otp_codes`

**Strengths:**
- UUID primary keys with `defaultRandom()` — good for security (no sequential IDs)
- Password hash stored separately from user data
- Role array allows multi-role users (e.g., seeker + discord_owner)
- Soft delete via `deleted_at`
- `last_login_at` for security auditing
- `otp_codes` has attempt limiting (max 3) and expiry

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No refresh token storage | **High** | `sessions` table exists but is **not used** by the codebase — JWT refresh tokens are validated but never stored/blacklisted. If a refresh token is stolen, it's valid forever. |
| OTP no automatic cleanup | Medium | No TTL/index on `otp_codes.expires_at` — expired records accumulate. Add a cleanup job or partial unique index. |
| `password_hash` nullable | Medium | OAuth users might not have passwords, but the current code expects `password_hash` for login. If OAuth is planned, this needs a `provider` column. |
| No `email_verified_at` timestamp | Low | `is_verified` boolean tells you *if* but not *when* — useful for compliance. |

**Recommendations:**
```sql
-- Store refresh tokens for revocation
ALTER TABLE sessions ADD COLUMN refresh_token_hash varchar(255);
ALTER TABLE sessions ADD COLUMN revoked_at timestamptz;

-- Add email verification timestamp
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- Add partial index for active OTPs (cleanup can target expired ones)
CREATE INDEX idx_otp_expires ON otp_codes(expires_at) WHERE expires_at < NOW();
```

---

### 3.2 Profiles (Seeker & Employer)

**Tables:** `seeker_profiles`, `employer_profiles`

**Strengths:**
- 1:1 relationship with users enforced via `UNIQUE` on `user_id`
- Seeker profile has comprehensive career fields, salary expectations, education
- Employer profile has company info, social links, industry
- Both have pgvector embedding column for AI matching
- Soft delete on both

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| Seeker `embedding` unused | Medium | Code only uses `resumes.embedding` for job matching. If `seeker_profiles.embedding` isn't populated, it's wasted storage. Either use it or remove it. |
| Employer `embedding` unused | Medium | Same as above — employer embedding isn't used for matching seekers to companies. |
| `seeker_profiles` missing `updated_at` trigger | Low | Has `updated_at` column but no auto-update trigger (same as all other tables — relying on application code) |
| `headline` too short (500 chars) | Low | Headlines can be up to ~2000 chars on platforms like LinkedIn. Consider expanding. |

**Recommendations:**
- Either implement profile-based matching or remove embedding columns from profiles
- Add `CHECK (headline IS NULL OR length(headline) <= 2000)` if expanding

---

### 3.3 Resumes

**Table:** `resumes`

**Strengths:**
- Full-text parsed with AI analysis stored
- pgvector embedding for semantic search
- Skills, experience years, education extracted
- Soft delete support

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No file hash / dedup | **High** | Users can upload the same file multiple times with no SHA-256 dedup check. This wastes storage and AI credits. |
| No file size tracking | Medium | No `file_size_bytes` column — can't enforce quotas or monitor storage. |
| No content-type tracking | Medium | `file_url` stores the path but not the MIME type — needed for download headers. |
| No `updated_at` | Low | Can't tell when resume was last re-analyzed. |

**Recommendations:**
```sql
ALTER TABLE resumes ADD COLUMN file_hash varchar(64);  -- SHA-256
ALTER TABLE resumes ADD COLUMN file_size_bytes integer;
ALTER TABLE resumes ADD COLUMN file_mimetype varchar(100);
ALTER TABLE resumes ADD COLUMN updated_at timestamptz DEFAULT now();
CREATE INDEX idx_resumes_file_hash ON resumes(file_hash);
```

---

### 3.4 Jobs

**Table:** `jobs`

**Strengths:**
- Comprehensive job fields (salary range, location, type, remote flag)
- Fingerprint for dedup across scrapers
- Embedding for vector search
- `employer_id` nullable → distinguishes scraped vs platform jobs
- Soft delete
- Active/inactive flag

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| `source` is a free varchar | **High** | Currently `varchar(100)` with no constraint. Scrapers set it to arbitrary strings like `"remotive"`, `"arbeitnow"`, `"greenhouse"`, `"hiring_cafe"`, `"internal"`. **Should be an enum** to prevent data quality issues. |
| Missing `company_logo_url` | Medium | UI displays job cards with company info but no logo — the code sets `logo_url: undefined`. Add to schema for richer display. |
| Missing `company_description` | Medium | Job cards show company name but no description for context. |
| No `is_remote` index | Medium | `remote` boolean has no index, but "remote" is a common filter. |
| `salary_min`/`salary_max` precision mismatch | Low | Uses `decimal(10,2)` but salaries are stored as raw numbers (not cents). Scraper code treats them as `Decimal` objects. Either document unit or use `integer` cents. |

**Recommendations:**
```sql
-- Replace varchar source with enum
CREATE TYPE job_source AS ENUM ('remotive', 'arbeitnow', 'greenhouse', 'hiring_cafe', 'internal', 'indeed', 'linkedin', 'company_direct');
ALTER TABLE jobs ALTER COLUMN source TYPE job_source USING source::job_source;

-- Add company logo + description
ALTER TABLE jobs ADD COLUMN company_logo_url text;
ALTER TABLE jobs ADD COLUMN company_description text;

-- Add indexes for common query patterns
CREATE INDEX idx_jobs_remote ON jobs(is_active, remote) WHERE is_active = true;
CREATE INDEX idx_jobs_source ON jobs(source);
CREATE INDEX idx_jobs_employer ON jobs(employer_id) WHERE employer_id IS NOT NULL;
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at DESC) WHERE is_active = true;
```

---

### 3.5 Job Matches

**Table:** `job_matches`

**Strengths:**
- Unique constraint per user+job prevents duplicate matches
- Match score decimal(5,2) allows 0.00–99.99 scoring
- AI explanation stored
- Save/unsave and applied tracking

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No `updated_at` | Low | Can't track when a match was re-scored or re-explained |
| No `viewed_at` | Medium | Can't track whether user saw this match — important for "new matches" badge |
| `ai_explanation` not indexed | Low | Not needed for search, but full-text search on explanations could be useful |

**Recommendations:**
```sql
ALTER TABLE job_matches ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE job_matches ADD COLUMN viewed_at timestamptz;
```

---

### 3.6 Applications

**Tables:** `applications`, `application_status_history`

**Strengths:**
- Full status lifecycle with history trail
- Unique constraint prevents duplicate applications
- Supports cover letter + notes
- Linked to resumes

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| `notes` field is ambiguous | **High** | Is this the seeker's notes or the employer's notes? At review/status-change time, both parties may want to add notes. Suggest splitting into `seeker_notes` and `employer_notes`. |
| No `updated_at` on `application_status_history` | Low | Status history is append-only, so `created_at` may suffice. But if statuses can be corrected, `updated_at` is needed. |
| No email notification trigger | Medium | When status changes (e.g., "accepted"), there's no automated email trigger in the schema. Currently handled in application code, but a DB-level trigger + `notifications` insert would be more reliable. |
| No Gmail/email integration field | Low | Your idea about "gmail access for application updates" — this would need an `email_sync` table storing OAuth tokens and last-sync timestamps. Currently out of scope. |

**Recommendations:**
```sql
ALTER TABLE applications RENAME COLUMN notes TO seeker_notes;
ALTER TABLE applications ADD COLUMN employer_notes text;

-- Add notifiable event support
ALTER TABLE applications ADD COLUMN notify_seeker boolean DEFAULT true;
ALTER TABLE applications ADD COLUMN notify_employer boolean DEFAULT true;
```

---

### 3.7 AI Conversations

**Tables:** `conversations`, `messages`, `system_prompts`

**Strengths:**
- Conversations linked to users and optionally to resumes
- Messages store role, content, tokens_used, metadata
- `system_prompts` table for version-controlled prompts
- Archive flag for soft-hiding conversations

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No `updated_at` on `messages` | Low | Messages are append-only, but message editing is a feature (see `editMessage` in controller) — needs `updated_at`. |
| No message soft-delete | Medium | Messages use `is_active` in the code but there's no column in the schema. The `messages` table lacks `deleted_at` or `is_active`. |
| No conversation-level `token_count` cache | Medium | Computing total tokens consumed per conversation requires scanning all messages — expensive for billing dashboards. |
| Missing index on `messages.conversation_id` | **High** | Most queries filter by conversation_id. Without an index, full-table scans happen. |
| Missing index on `conversations.user_id` | **High** | Sidebar queries load all conversations for a user. Missing index = slow sidebar. |
| `model` on conversations never populated | Low | The `model` column exists but the code always passes `undefined`. Consider removing or implementing. |

**Recommendations:**
```sql
-- Add missing columns
ALTER TABLE messages ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE messages ADD COLUMN deleted_at timestamptz;
ALTER TABLE conversations ADD COLUMN total_tokens_used integer DEFAULT 0;

-- Add critical indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_user_archived ON conversations(user_id, is_archived) WHERE is_archived = false;
```

---

### 3.8 Bots & Social

**Tables:** `bot_configs`, `discord_configs`, `bot_posts`

**Critical Issue: `discord_configs` is a redundant table.**

- `bot_configs` already covers Discord via `platform = 'discord'` with full filter support
- `discord_configs` duplicates guild/channel/user mapping with *fewer features* (no filters, no credentials)
- The codebase uses BOTH tables inconsistently:
  - `bot.controller.ts` → reads/writes `bot_configs` (correct path)
  - `discord.controller.ts` → reads/writes `discord_configs` (redundant path)
  - `bot/src/worker.py` → reads `discord_configs` directly (bypassing bot_configs)
- This WILL cause data inconsistency (e.g., a user configures filters on bot_configs but the Discord worker reads discord_configs and ignores filters)

**Recommendation: Remove `discord_configs` and standardize on `bot_configs`.**

```sql
-- Step 1: Migrate data
INSERT INTO bot_configs (user_id, platform, target_id, target_name, is_active, created_at, updated_at)
SELECT user_id, 'discord', guild_id, guild_id, is_active, created_at, updated_at
FROM discord_configs
ON CONFLICT (user_id, platform) DO NOTHING;

-- Step 2: Drop redundant table
DROP TABLE discord_configs;

-- Step 3: Update bot worker to read from bot_configs
```

**Other Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| `filter_keywords` as CSV varchar(500) | **High** | Comma-separated strings are impossible to query efficiently (`LIKE '%engineer%'` can't use indexes). Change to `text[]` array. |
| `filter_locations` as CSV varchar(500) | **High** | Same issue as keywords. |
| `credentials` stored as plain JSONB | **High** | Discord bot tokens, Twitter API keys, Reddit credentials — **all stored in plaintext**. Must use pgcrypto or application-level encryption. |
| No `last_error` / `error_count` | Medium | When a bot fails to post (rate limit, token expired), there's no error tracking on the config itself. |
| `bot_posts` missing `created_at`? | Check | Has `posted_at` but no `created_at` — both are set to `now()` on insert, so this is fine. |
| No platform-specific config columns | Medium | Each platform has unique needs: Discord needs `channel_id` + `guild_id`, Reddit needs `subreddit`, Twitter needs `hashtags`. Consider a `platform_config` JSONB column instead of top-level columns. |

**Recommendations:**
```json5
// Replace discord_configs with unified bot_configs approach:

// 1. Add platform_config JSONB for flexibility
ALTER TABLE bot_configs ADD COLUMN platform_config jsonb;
// {
//   "discord": { "guild_id": "123", "channel_id": "456" },
//   "reddit": { "subreddit": "jobs", "post_flair": "Hiring" },
//   "twitter": { "hashtags": ["hiring", "jobs"] }
// }

// 2. Change filter fields to arrays
ALTER TABLE bot_configs 
  ALTER COLUMN filter_keywords TYPE text[] USING string_to_array(filter_keywords, ','),
  ALTER COLUMN filter_locations TYPE text[] USING string_to_array(filter_locations, ',');

// 3. Add encryption note (handled at app level)
COMMENT ON COLUMN bot_configs.credentials IS 'Encrypted JSON. Use pgcrypto or app-level AES-256-GCM.';

// 4. Add error tracking
ALTER TABLE bot_configs ADD COLUMN last_error text;
ALTER TABLE bot_configs ADD COLUMN error_count integer DEFAULT 0;
ALTER TABLE bot_configs ADD COLUMN last_success_at timestamptz;
```

---

### 3.9 Billing (Subscriptions & Payments)

**Tables:** `subscriptions`, `payments`

**Strengths:**
- Dodo Payments integration fields (subscription_id, customer_id)
- `raw_data` JSONB for full webhook payload retention (audit trail)
- Idempotency key on payments (prevents double-charge)
- Payment status enum covers all states (pending, succeeded, failed, refunded, disputed)
- Subscription status covers lifecycle (active, cancelled, past_due, trialing, paused, expired)

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No `trial_ends_at` on subscriptions | **High** | Free trials are common for SaaS. Without this column, you can't know when a trial ends. Dodo sends it in webhooks but it's not stored. |
| No `plan_features` table | **High** | What does each plan include? Currently hardcoded in application logic. A `plan_features` table maps plans → feature flags + limits (e.g., `{"max_resumes": 5, "max_bots": 3, "tokens_per_month": 50000}`). |
| `amount` is `integer` — unit unclear | Medium | Is this cents? Dollars? Micro-dollars? Dodo returns amounts in cents (smallest currency unit). Document this or use `decimal(10,2)`. |
| `unique` on `subscriptions.user_id` | Medium | One subscription per user. What about plan upgrades? Dodo creates a new subscription on upgrade, the old one is cancelled. Current schema needs to handle this — upsert on user_id with plan change tracking. |
| No `dodo_product_id` on subscriptions | Medium | Dodo uses product IDs to identify what was purchased. Without storing it, you can't verify webhooks against expected products. |
| No `payment_method` on payments | Low | No record of payment method (card, PayPal, crypto). Useful for support. |
| `cancelled_at` vs `current_period_end` | Low | When a subscription is cancelled, `current_period_end` tells you when access expires, but `cancelled_at` tells you when the cancellation was initiated. Both exist — good. But `access_until` would be more explicit. |

**Recommendations:**
```sql
-- Add trial tracking
ALTER TABLE subscriptions ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN dodo_product_id varchar(255);

-- Create plan features table
CREATE TABLE plan_features (
  plan subscription_plan NOT NULL PRIMARY KEY,
  max_resumes integer NOT NULL DEFAULT 0,
  max_conversations integer NOT NULL DEFAULT 0,
  max_bot_configs integer NOT NULL DEFAULT 0,
  tokens_per_month integer NOT NULL DEFAULT 0,
  tokens_rollover boolean NOT NULL DEFAULT false,
  ai_model varchar(50) NOT NULL DEFAULT 'gpt-4o-mini',
  features jsonb NOT NULL DEFAULT '{}',  -- feature flags like '{"resume_analysis": true, "job_matching": true}'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed plan features
INSERT INTO plan_features (plan, max_resumes, max_conversations, max_bot_configs, tokens_per_month, tokens_rollover, ai_model, features) VALUES
  ('seeker', 5, 100, 0, 50000, false, 'gpt-4o-mini', '{"resume_analysis": true, "job_matching": true, "ai_chat": true}'),
  ('employer', 0, 50, 0, 25000, false, 'gpt-4o-mini', '{"job_posting": true, "candidate_search": true}'),
  ('discord_owner', 0, 0, 5, 100000, true, 'gpt-4o-mini', '{"bot_discord": true, "bot_reddit": true, "bot_twitter": true, "keyword_filters": true}');

-- Document amount unit
COMMENT ON COLUMN payments.amount IS 'Amount in USD cents (e.g., 999 = $9.99)';

-- Add amount conversion helper if needed
ALTER TABLE payments ADD COLUMN amount_cents integer GENERATED ALWAYS AS (amount) STORED;
```

---

### 3.10 Notifications

**Table:** `notifications`

**Strengths:**
- Full status tracking (pending → sent/failed/bounced/opened)
- Stores raw content (HTML or text)
- Linked to users

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No email template table | Medium | HTML emails are hardcoded in `auth.service.ts`. A `email_templates` table with template_name, subject, html_body, variables would enable self-service. |
| No batch/scheduled tracking | Medium | No `scheduled_at` column for delayed notifications. Currently all notifications are sent immediately. |
| No `channel` enum | Low | Only email is supported. If push notifications or in-app notifications are planned, add a `channel` enum (`email`, `push`, `in_app`). |
| Template variable substitution | Medium | Without a template system, changing email copy requires code deploys. |

**Recommendations:**
```sql
CREATE TYPE notification_channel AS ENUM ('email', 'push', 'in_app');
ALTER TABLE notifications ADD COLUMN channel notification_channel NOT NULL DEFAULT 'email';
ALTER TABLE notifications ADD COLUMN scheduled_at timestamptz;
ALTER TABLE notifications ADD COLUMN read_at timestamptz;  -- for in-app notifications

CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name varchar(100) NOT NULL UNIQUE,
  subject_template text NOT NULL,       -- 'Welcome to {{app_name}}!'
  html_template text NOT NULL,           -- '<h1>Hi {{name}}...</h1>'
  text_template text,                    -- plain text fallback
  variables jsonb NOT NULL DEFAULT '[]', -- ['name', 'app_name']
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

### 3.11 System (Audit & Token Usage)

**Tables:** `audit_log`, `token_usage`

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| `audit_log` missing `details` JSONB | **High** | You can see *what* action happened but not *what changed*. Before/after snapshots are essential for compliance and debugging. |
| `audit_log` missing `ip_address` | Medium | Security audits need IP addresses. |
| `token_usage` no quota enforcement | **High** | Tracks how many tokens are used but there's **no check** against subscription limits. A free user can consume unlimited tokens. |
| `token_usage` window granularity | Medium | `window_start` is a timestamp — but what's the window size? 1 hour? 1 day? 1 month? The unique constraint prevents two records for the same user+window, but the application must decide the window size. Recommend standardizing on `monthly` buckets. |
| `audit_log` no index on `actor_id` | Medium | Querying "what did user X do?" requires a full scan. |
| `audit_log` no index on `entity_type + entity_id` | Medium | Querying "what happened to this job?" requires a full scan. |

**Recommendations:**
```sql
-- Fix audit_log
ALTER TABLE audit_log ADD COLUMN details jsonb;  -- {"before": {...}, "after": {...}}
ALTER TABLE audit_log ADD COLUMN ip_address varchar(45);
ALTER TABLE audit_log ADD COLUMN user_agent text;

CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- Fix token_usage: add quota tracking + monthly window
ALTER TABLE token_usage ADD COLUMN window_type varchar(10) NOT NULL DEFAULT 'monthly';
ALTER TABLE token_usage DROP CONSTRAINT token_usage_user_id_window_start_unique;
CREATE UNIQUE INDEX idx_token_usage_monthly ON token_usage(user_id, date_trunc('month', window_start));

-- Add a materialized or computed remaining_tokens for fast queries
ALTER TABLE token_usage ADD COLUMN tokens_remaining integer;
-- This should be computed by the application using subscription.tokens_per_month - SUM(tokens_used)
```

---

### 3.12 Relations

**Overall: Good.** Drizzle relations are correctly defined with proper foreign keys.

**Missing relations:**
- `users → many(applications)` as employer (via `jobs.employer_id` → `applications.job_id`) — useful for "jobs I've posted → applicants" queries
- No `created_at` on many-to-many through tables (e.g., `job_matches` has it ✅, `bot_posts` has it ✅)

---

## 4. Critical Issues Found (Must Fix)

| # | Issue | Impact | Fix Priority |
|---|-------|--------|-------------|
| C1 | **`discord_configs` table is redundant** — data inconsistency guaranteed | Bots will miss filter configurations, users won't get niche-filtered jobs | **P0 — Fix now** |
| C2 | **No token quota enforcement** — `token_usage` tracks but doesn't limit | Free users can drain AI budget, paid users get no differentiation | **P0 — Fix now** |
| C3 | **`bot_configs.credentials` stored in plain JSONB** | Discord/Reddit/Twitter tokens exposed if DB is breached | **P0 — Fix now** |
| C4 | **No plan_features/limits table** | Plan capabilities hardcoded in app — cannot change without deploy | **P1 — Fix this sprint** |
| C5 | **Missing indexes on `messages.conversation_id` and `conversations.user_id`** | Chat UI will slow down as conversations grow | **P1 — Fix this sprint** |
| C6 | **`notes` on applications is ambiguous** | Seekers' and employers' notes mixed together | **P1 — Fix this sprint** |
| C7 | **`job.source` is free varchar instead of enum** | Data quality degrades over time as scrapers use inconsistent names | **P1 — Fix this sprint** |
| C8 | **No trial tracking on subscriptions** | Cannot offer free trials, which is standard for SaaS | **P1 — Fix this sprint** |

---

## 5. Data Integrity & Strictness Gaps

### 5.1 Missing `NOT NULL` Constraints

| Table | Column | Why |
|-------|--------|-----|
| `jobs` | `source_url` | Every scraped job has a URL — should be NOT NULL |
| `applications` | `applied_at` | Has `defaultNow()` but nullable — should be NOT NULL |
| `subscriptions` | `dodo_subscription_id` | Every subscription has a Dodo ID — should be NOT NULL after payment |
| `payments` | `dodo_payment_id` | Same as above |
| `messages` | `role` | Should be constrained to ENUM or CHECK (user/assistant/system) |

### 5.2 Missing `CHECK` Constraints

```sql
-- Add CHECK constraints for data quality
ALTER TABLE users ADD CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE jobs ADD CONSTRAINT chk_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max);
ALTER TABLE job_matches ADD CONSTRAINT chk_match_score_range CHECK (match_score >= 0 AND match_score <= 100);
ALTER TABLE applications ADD CONSTRAINT chk_valid_statuses CHECK (status IN ('applied','under_review','phone_screen','interviewed','offer_extended','accepted','rejected','withdrawn'));
ALTER TABLE messages ADD CONSTRAINT chk_valid_role CHECK (role IN ('user', 'assistant', 'system'));
```

### 5.3 Missing `ON DELETE` Actions

| Foreign Key | Current | Recommended | Reason |
|-------------|---------|-------------|--------|
| `applications.job_id` → `jobs.id` | `cascade` | `set null` or `restrict` | Deleting a job shouldn't delete application records (audit trail) |
| `bot_posts.job_id` → `jobs.id` | `set null` | `set null` ✅ | Correct — keeping post history even if job is deleted |
| `subscriptions.user_id` → `users.id` | `cascade` | `restrict` | Never auto-delete billing records! |

---

## 6. Performance & Indexing Gaps

### Current Indexes
```
✅ users.email (unique)
✅ users.roles (GIN index)
✅ otp_codes.user_id
✅ resumes.user_id
✅ seeker_profiles.user_id
✅ employer_profiles.user_id
✅ jobs.company_name
✅ jobs.is_active
✅ discord_configs.guild_id
```

### Missing Indexes (Priority Order)

| Priority | Table | Columns | Reason |
|----------|-------|---------|--------|
| P0 | `messages` | `conversation_id` | Every chat renders by querying messages WHERE conversation_id = X |
| P0 | `conversations` | `user_id` WHERE is_archived=false | Sidebar lists all active conversations |
| P0 | `token_usage` | `user_id, date_trunc('month', window_start)` | Monthly billing queries |
| P1 | `jobs` | `source` | Filtering/grouping by source |
| P1 | `jobs` | `is_active, posted_at DESC` | "Latest jobs" queries |
| P1 | `jobs` | `employer_id` WHERE employer_id IS NOT NULL | Employer's job listings |
| P1 | `applications` | `seeker_id` | Seeker's application list |
| P1 | `applications` | `job_id` | Job's applicant list |
| P1 | `subscriptions` | `status` | Finding active subscriptions |
| P1 | `payments` | `user_id, created_at DESC` | Payment history |
| P2 | `bot_configs` | `user_id` | User's bot configurations |
| P2 | `bot_configs` | `platform, is_active` | Active bots by platform |
| P2 | `notifications` | `user_id, status` | Pending notification queue |
| P2 | `audit_log` | `actor_id` | User activity audit |
| P2 | `audit_log` | `entity_type, entity_id` | Entity change history |

### Full Recommended Index Set
```sql
-- CHAT
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_user_active ON conversations(user_id) WHERE is_archived = false;

-- JOBS
CREATE INDEX idx_jobs_active_posted ON jobs(is_active, posted_at DESC) WHERE is_active = true;
CREATE INDEX idx_jobs_source ON jobs(source);
CREATE INDEX idx_jobs_employer_active ON jobs(employer_id) WHERE employer_id IS NOT NULL AND is_active = true;
CREATE INDEX idx_jobs_remote_active ON jobs(remote, posted_at DESC) WHERE is_active = true;

-- APPLICATIONS
CREATE INDEX idx_applications_seeker ON applications(seeker_id, created_at DESC);
CREATE INDEX idx_applications_job ON applications(job_id, status);
CREATE INDEX idx_app_history_application ON application_status_history(application_id, created_at DESC);

-- BILLING
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX idx_payments_dodo ON payments(dodo_payment_id);
CREATE INDEX idx_token_usage_user_month ON token_usage(user_id, date_trunc('month', window_start));

-- BOTS
CREATE INDEX idx_bot_configs_user ON bot_configs(user_id);
CREATE INDEX idx_bot_configs_active ON bot_configs(platform, is_active) WHERE is_active = true;
CREATE INDEX idx_bot_posts_config ON bot_posts(bot_config_id, posted_at DESC);

-- SYSTEM
CREATE INDEX idx_notifications_pending ON notifications(user_id, status) WHERE status = 'pending';
CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
```

---

## 7. Recommended Schema Changes

### 7.1 Immediate (P0 — Break/Fix)

```sql
-- 1. Standardize on bot_configs, remove discord_configs
-- (See Section 3.8 for migration script)

-- 2. Encrypt credentials column
COMMENT ON COLUMN bot_configs.credentials IS 'AES-256-GCM encrypted JSON. Decrypt at application layer.';

-- 3. Add token quota to subscriptions (via plan_features table)
CREATE TABLE plan_features (...); -- See Section 3.9

-- 4. Add missing critical indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);

-- 5. Convert job.source to enum
CREATE TYPE job_source AS ENUM ('remotive','arbeitnow','greenhouse','hiring_cafe','internal','indeed','linkedin','company_direct','generic');
ALTER TABLE jobs ALTER COLUMN source TYPE job_source USING source::job_source;
```

### 7.2 Short-term (P1 — This Sprint)

```sql
-- Split application notes
ALTER TABLE applications RENAME COLUMN notes TO seeker_notes;
ALTER TABLE applications ADD COLUMN employer_notes text;

-- Add trial tracking
ALTER TABLE subscriptions ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN dodo_product_id varchar(255);

-- Add file metadata to resumes
ALTER TABLE resumes ADD COLUMN file_hash varchar(64);
ALTER TABLE resumes ADD COLUMN file_size_bytes integer;
ALTER TABLE resumes ADD COLUMN file_mimetype varchar(100);

-- Add details to audit_log
ALTER TABLE audit_log ADD COLUMN details jsonb;
ALTER TABLE audit_log ADD COLUMN ip_address varchar(45);

-- Add message soft-delete + updated_at
ALTER TABLE messages ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE messages ADD COLUMN deleted_at timestamptz;

-- Change bot filter fields to arrays
ALTER TABLE bot_configs ALTER COLUMN filter_keywords TYPE text[] USING string_to_array(filter_keywords, ',');
ALTER TABLE bot_configs ALTER COLUMN filter_locations TYPE text[] USING string_to_array(filter_locations, ',');
```

### 7.3 Medium-term (P2 — Next Sprint)

```sql
-- Company info on jobs
ALTER TABLE jobs ADD COLUMN company_logo_url text;
ALTER TABLE jobs ADD COLUMN company_description text;

-- Email templates table
CREATE TABLE email_templates (...); -- See Section 3.10

-- Notification channels
ALTER TABLE notifications ADD COLUMN channel notification_channel DEFAULT 'email';
ALTER TABLE notifications ADD COLUMN scheduled_at timestamptz;

-- CHECK constraints for data integrity
ALTER TABLE jobs ADD CONSTRAINT chk_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max);
ALTER TABLE job_matches ADD CONSTRAINT chk_match_score_range CHECK (match_score >= 0 AND match_score <= 100);
ALTER TABLE messages ADD CONSTRAINT chk_valid_role CHECK (role IN ('user', 'assistant', 'system'));
```

---

## 8. Edge Cases & Security Considerations

### 8.1 Dodo Payments Edge Cases

| Scenario | Current Behavior | Required Behavior |
|----------|-----------------|-------------------|
| Webhook arrives before user record created | No user found → webhook silently ignored | Queue webhook for retry; create user if missing |
| Duplicate webhook (Dodo retries) | `idempotency_key` can prevent double-insert, but it's optional | **Make `idempotency_key` UNIQUE and NOT NULL** |
| Subscription cancelled mid-cycle | `current_period_end` still gives access | Access should persist until `current_period_end` — verify app enforces this |
| Payment dispute/chargeback | `payments.status = 'disputed'` | Need to revoke access immediately and log in audit |
| Plan upgrade (new subscription created) | Unique on `user_id` prevents multiple active subs | Use `ON CONFLICT DO UPDATE` with status tracking on old sub |
| Dodo API down during checkout | `checkoutHandler` would fail | Frontend should show "payment service unavailable" |
| Webhook signature verification | Dodo SDK handles this | Ensure `DODO_PAYMENTS_WEBHOOK_KEY` is rotated quarterly |

**SQL fixes for Dodo:**
```sql
-- Make idempotency_key required and unique
ALTER TABLE payments ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX idx_payments_idempotency ON payments(idempotency_key);

-- Track subscription changes (for plan upgrades)
CREATE TABLE subscription_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  from_subscription_id varchar(255),
  to_subscription_id varchar(255) NOT NULL,
  from_plan subscription_plan,
  to_plan subscription_plan NOT NULL,
  reason varchar(100), -- 'upgrade', 'downgrade', 'cancel', 'reactivate'
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 8.2 Bot Token Security

Bot tokens (Discord, Reddit, Twitter) in `bot_configs.credentials` are stored as **plain JSONB**.

**Attack scenarios:**
1. SQL injection → attacker dumps all bot tokens → takes over Discord servers
2. DB backup leak → all credentials exposed
3. Rogue employee → exports credentials

**Required fix:**
```sql
-- Add pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt at application layer (recommended) OR use pgcrypto
-- Application-level: encrypt with AES-256-GCM before writing to DB
-- COMMENT column for documentation
COMMENT ON COLUMN bot_configs.credentials IS 'AES-256-GCM encrypted. Key in env var BOT_CREDENTIALS_ENCRYPTION_KEY.';
```

### 8.3 Rate Limiting & Abuse

| Vector | Protection Needed | Current State |
|--------|------------------|---------------|
| AI chat token exhaustion | Per-user daily/monthly cap | `token_usage` tracks but doesn't enforce |
| Resume upload spam | File hash dedup, daily limit | No file hash, no rate limit |
| Bot config spam | Max bots per plan | No plan_features enforcement |
| API scraping | Token bucket + rate limit | ✅ Implemented in middleware |
| Registration spam | OTP + email verification | ✅ Implemented |

### 8.4 Data Retention & GDPR

| Table | Retention Policy | Status |
|-------|-----------------|--------|
| `audit_log` | 12 months | ❌ No cleanup mechanism |
| `otp_codes` | Delete after verification or expiry | ⚠️ Expired codes accumulate |
| `messages` | Keep indefinitely or delete with user | ❌ No user deletion cascade |
| `payments` | 7 years (legal requirement) | ✅ `deleted_at` not applicable — keep forever |
| `sessions` | Delete after expiry | ❌ No cleanup job |
| `token_usage` | 12 months for billing analysis | ❌ No cleanup job |

**Add cleanup policies:**
```sql
-- Example: cleanup expired OTPs daily
CREATE OR REPLACE FUNCTION cleanup_expired_otps() RETURNS void AS $$
  DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL '24 hours';
$$ LANGUAGE sql;

-- Schedule via pg_cron or application cron job
-- SELECT cron.schedule('cleanup-otps', '0 3 * * *', 'SELECT cleanup_expired_otps()');
```

---

## Appendix A: Quick-Reference Fix Checklist

```markdown
### P0 — Must Fix Immediately
- [ ] Remove `discord_configs`, migrate to `bot_configs`
- [ ] Add token quota enforcement via `plan_features` table
- [ ] Encrypt `bot_configs.credentials`
- [ ] Add indexes: `messages.conversation_id`, `conversations.user_id`

### P1 — Fix This Sprint
- [ ] Split `applications.notes` into seeker/employer notes
- [ ] Add `trial_ends_at` to subscriptions
- [ ] Convert `job.source` to enum
- [ ] Add file hash + size to resumes
- [ ] Add `details` JSONB + IP to audit_log
- [ ] Change bot filter fields to arrays
- [ ] Add all missing indexes (12 indexes)
- [ ] Add CHECK constraints (salary range, match score, message role)

### P2 — Next Sprint
- [ ] Add company_logo_url + description to jobs
- [ ] Create email_templates table
- [ ] Add notification channel support
- [ ] Add payment idempotency enforcement
- [ ] Add subscription change tracking
- [ ] Set up GDPR data retention cleanup jobs
```

---

*End of Audit. Total findings: 8 Critical, 12 Moderate, 6 Low. Schema is fundamentally sound but needs hardening in security, performance, and billing domains.*
