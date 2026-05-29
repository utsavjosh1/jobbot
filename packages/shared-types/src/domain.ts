// ─── Application Types ────────────────────────────────────────────────────────

export type ApplicationStatus =
  | "applied"
  | "under_review"
  | "phone_screen"
  | "interviewed"
  | "offer_extended"
  | "accepted"
  | "rejected"
  | "withdrawn";

export interface StatusHistoryEntry {
  status: ApplicationStatus;
  timestamp: string;
  note?: string;
}

export interface Application {
  id: string;
  seeker_id: string;
  job_id: string;
  resume_id?: string | null;
  status: ApplicationStatus;
  status_history: StatusHistoryEntry[];
  cover_letter?: string | null;
  applied_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Employer Profile Types ───────────────────────────────────────────────────

export interface CreateEmployerProfileInput {
  company_name: string;
  company_website?: string;
  company_logo_url?: string;
  company_description?: string;
  company_size?: string;
  industry?: string;
  headquarters_location?: string;
  social_links?: Record<string, string>;
}

export type UpdateEmployerProfileInput = Partial<CreateEmployerProfileInput>;

export interface EmployerProfile extends CreateEmployerProfileInput {
  id: string;
  user_id: string;
  active_job_count: number;
  is_verified: boolean;
  embedding?: number[] | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Seeker Profile Types ─────────────────────────────────────────────────────

export type ExperienceLevel = "entry" | "mid" | "senior" | "lead" | "executive";
export type DesiredJobType =
  | "full_time"
  | "part_time"
  | "contract"
  | "freelance"
  | "internship";

export interface SeekerProfileData {
  headline?: string;
  summary?: string;
  skills?: string[];
  experience_years?: number;
  experience_level?: ExperienceLevel;
  education?: unknown;
  certifications?: string[];
  languages?: unknown[];
  work_history?: unknown[];
  desired_job_titles?: string[];
  desired_locations?: string[];
  desired_salary_min?: string;
  desired_salary_max?: string;
  desired_job_type?: DesiredJobType;
  open_to_remote?: boolean;
  open_to_relocation?: boolean;
}

export interface SeekerProfile extends SeekerProfileData {
  id: string;
  user_id: string;
  embedding?: number[] | null;
  prompt_history_summary?: string | null;
  last_parsed_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Subscription Types ───────────────────────────────────────────────────────

export type SubscriptionPlan = "seeker" | "employer" | "discord_owner";
export type SubscriptionStatus =
  | "active"
  | "cancelled"
  | "past_due"
  | "trialing"
  | "paused"
  | "expired";

export interface DodoSubscriptionPayload {
  dodo_customer_id?: string;
  dodo_subscription_id?: string;
  dodo_product_id?: string;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  current_period_start?: Date;
  current_period_end?: Date;
  trial_ends_at?: Date;
  cancelled_at?: Date;
  access_until?: Date;
  raw_data?: unknown;
}

export interface Subscription extends DodoSubscriptionPayload {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  created_at: Date;
  updated_at: Date;
}

// ─── Payment Types ────────────────────────────────────────────────────────────

export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "disputed";

export interface CreatePaymentInput {
  dodo_payment_id?: string;
  dodo_customer_id?: string;
  event_type: string;
  status: PaymentStatus;
  amount: number;
  currency?: string;
  paid_at?: Date;
  raw_payload?: unknown;
  idempotency_key?: string;
}

export interface Payment extends CreatePaymentInput {
  id: string;
  user_id: string;
  subscription_id?: string | null;
  currency: string;
  created_at: Date;
}

// ─── Notification Types ───────────────────────────────────────────────────────

export type NotificationStatus =
  | "pending"
  | "sent"
  | "failed"
  | "bounced"
  | "opened";

export interface CreateNotificationInput {
  user_id: string;
  type?: string;
  to_email: string;
  subject: string;
  content: string;
  scheduled_at?: Date;
}

export interface Notification extends CreateNotificationInput {
  id: string;
  status: NotificationStatus;
  error_message?: string | null;
  sent_at?: Date | null;
  created_at: Date;
}

// ─── AI / Embedding Types ─────────────────────────────────────────────────────

export type EmbeddingInputType = "document" | "query";

export interface EmbeddingMetadata {
  model: string;
  dimension: number;
  totalTokens: number;
  inputCount: number;
  batchCount: number;
  latencyMs: number;
  inputType: EmbeddingInputType;
}

export interface EmbeddingResult {
  embeddings: number[][];
  metadata: EmbeddingMetadata;
}

export interface SingleEmbeddingResult {
  embedding: number[];
  metadata: EmbeddingMetadata;
}

// ─── AI / Chat Types ──────────────────────────────────────────────────────────

export interface ChatMetadata {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface ChatResult {
  text: string;
  metadata: ChatMetadata;
}

export interface ChatStreamResult {
  stream: AsyncIterable<string>;
  /** Populated after stream is fully consumed. */
  getMetadata: () => ChatMetadata;
}

// ─── RAG Types ────────────────────────────────────────────────────────────────

export interface VectorSearchResult {
  similarity: number;
  [key: string]: unknown;
}

export interface JobSearchFilters {
  location?: string;
  job_type?: string;
  remote?: boolean;
  salary_min?: number;
  skills?: string[];
}

export type BotPlatform = "discord" | "reddit" | "twitter";

// ═══════════════════════════════════════════════════════════════════════════════
// SCRAPER TYPES (JobSpy Integration)
// ═══════════════════════════════════════════════════════════════════════════════

export type ScraperSource =
  | "indeed"
  | "linkedin"
  | "zip_recruiter"
  | "glassdoor"
  | "google_jobs"
  | "bayt"
  | "naukri"
  | "bdjobs";

export interface ScrapedJobInput {
  title: string;
  company_name: string;
  description: string;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_interval?: string | null;
  salary_currency?: string | null;
  salary_source?: string | null;
  job_type?: string | null;
  remote?: boolean;
  source: ScraperSource;
  source_url: string;
  job_url?: string | null;
  company_url?: string | null;
  company_logo_url?: string | null;
  company_description?: string | null;
  company_industry?: string | null;
  company_num_employees?: string | null;
  company_revenue?: string | null;
  company_rating?: number | null;
  company_reviews_count?: number | null;
  skills_required?: string[] | null;
  experience_required?: string | null;
  experience_range?: string | null;
  vacancy_count?: number | null;
  work_from_home_type?: string | null;
  job_function?: string | null;
  posted_at?: string | null;
  fingerprint?: string | null;
}

export interface ScraperRun {
  id: string;
  cycle_number: number;
  search_term: string;
  location: string;
  site: string;
  jobs_scraped: number;
  jobs_inserted: number;
  jobs_skipped: number;
  proxy_count: number;
  error_message?: string | null;
  duration_ms?: number | null;
  scraper_version?: string | null;
  started_at: Date;
  completed_at?: Date | null;
  created_at: Date;
}
