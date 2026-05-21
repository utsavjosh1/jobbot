import {
  Notification,
  SubscriptionPlan,
  EmbeddingInputType,
  EmbeddingResult,
  SingleEmbeddingResult,
  ChatMetadata,
  ChatResult,
  ChatStreamResult,
  VectorSearchResult,
  JobSearchFilters,
  BotPlatform,
  SeekerProfile,
  EmployerProfile,
  ApplicationStatus,
  CreateEmployerProfileInput,
  UpdateEmployerProfileInput,
  NotificationStatus,
  CreatePaymentInput,
  SeekerProfileData,
  SubscriptionStatus,
  DodoSubscriptionPayload,
} from "./domain.js";

export type {
  Notification,
  SubscriptionPlan,
  EmbeddingInputType,
  EmbeddingResult,
  SingleEmbeddingResult,
  ChatMetadata,
  ChatResult,
  ChatStreamResult,
  VectorSearchResult,
  JobSearchFilters,
  BotPlatform,
  SeekerProfile,
  EmployerProfile,
  ApplicationStatus,
  CreateEmployerProfileInput,
  UpdateEmployerProfileInput,
  NotificationStatus,
  CreatePaymentInput,
  SeekerProfileData,
  SubscriptionStatus,
  DodoSubscriptionPayload,
};

export type ConversationState =
  | "idle"
  | "thinking"
  | "streaming"
  | "completed"
  | "error"
  | "interrupted";

// User types
export type UserRole = "job_seeker" | "employer" | "admin" | "discord_owner";

export interface User {
  id: string;
  email: string;
  full_name?: string;
  roles: UserRole[];
  is_verified: boolean;
  timezone?: string | null;
  avatar_url?: string | null;
  locale?: string | null;
  deleted_at?: Date | null;
  password_reset_token?: string;
  password_reset_expires_at?: Date;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name?: string;
  roles?: UserRole[];
}

/** DB-level input for creating a user (password already hashed) */
export interface CreateUserDbInput {
  email: string;
  password_hash: string;
  full_name?: string;
  roles?: UserRole[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, "password_hash">;
  access_token: string;
  refresh_token?: string;
}

// Resume types
export interface Resume {
  id: string;
  user_id: string;
  file_url: string;
  parsed_text?: string;
  skills?: string[];
  experience_years?: number;
  education?: EducationEntry[];
  embedding?: number[] | string;
  created_at: Date;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year?: number;
  field_of_study?: string;
}

export interface ResumeAnalysis {
  skills: string[];
  experience_years: number;
  education: EducationEntry[];
  summary: string;
}

// Job types
export type JobType = "full-time" | "part-time" | "contract" | "internship";
export type JobSource =
  | "indeed"
  | "linkedin"
  | "company_direct"
  | "remote_co"
  | "remote_ok"
  | "weworkremotely"
  | "google_jobs"
  | "generic";
export type JobStatus = "active" | "expired" | "filled";

export interface Job {
  id: string;
  title: string;
  company_name: string;
  description: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  job_type?: JobType;
  remote: boolean;
  source: JobSource;
  source_url?: string;
  skills_required?: string[];
  experience_required?: string;
  posted_at?: Date;
  expires_at?: Date;
  is_active: boolean;
  employer_id?: string;
  external_job_id?: string;
  fingerprint?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateJobInput {
  title: string;
  company_name: string;
  description: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  job_type?: JobType;
  remote?: boolean;
  skills_required?: string[];
  experience_required?: string;
  expires_at?: Date;
  external_job_id?: string;
  fingerprint?: string;
}

// Job Match types
export interface JobMatch {
  id: string;
  user_id: string;
  resume_id: string;
  job_id: string;
  match_score: number;
  ai_explanation: string;
  is_saved: boolean;
  applied: boolean;
  created_at: Date;
  job?: Job;
}

// Optimized Job Match for UI (no embeddings, grouped for scannability)
export interface OptimizedJobMatch {
  id: string;
  display_info: {
    title: string;
    company: string;
    location: string;
    logo_url?: string;
    source: JobSource;
  };
  matching_data: {
    match_score: number;
    ai_explanation?: string;
    key_skills: string[];
  };
  meta: {
    posted_at?: string; // ISO 8601
    apply_url?: string;
    remote: boolean;
    salary_range?: string;
  };
}

export interface MatchJobsInput {
  resume_id: string;
  filters?: JobSearchFilters;
  limit?: number;
}

// Bots & Social types
export interface BotConfig {
  id: string;
  user_id: string;
  platform: BotPlatform;
  is_active: boolean;
  target_id?: string;
  target_name?: string;
  webhook_url?: string;
  credentials?: Record<string, unknown>;
  filter_keywords?: string;
  filter_locations?: string;
  filter_min_salary?: string;
  filter_job_types?: string[];
  last_post_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface BotPost {
  id: string;
  bot_config_id: string;
  job_id: string;
  external_post_id?: string;
  status: "sent" | "failed";
  error_message?: string;
  posted_at: Date;
}

export interface MessageMetadata {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  job_matches?: OptimizedJobMatch[];
  [key: string]: unknown;
}

export type StreamChatResponse =
  | { type: "chunk"; content: string }
  | { type: "metadata"; metadata: MessageMetadata }
  | { type: "complete"; message_id: string; metadata: MessageMetadata }
  | { type: "error"; error: string };

// AI Chat types
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  conversation_history?: ChatMessage[];
  resume_id?: string;
}

export interface ChatResponse {
  message: string;
  suggestions?: JobMatch[];
  resume_feedback?: ResumeFeedback;
}

export interface ResumeFeedback {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  ats_score: number;
}

// Enhanced Chat types for persistence
export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  resume_id: string | null;
  model?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tokens_used?: number;
  status?: "sending" | "completed" | "error";
  metadata?: MessageMetadata;
  version?: number;
  is_active?: boolean;
  created_at: Date;
}

export interface CreateConversationRequest {
  resume_id?: string;
  initial_message?: string;
}

export interface SendMessageRequest {
  message: string;
  conversation_id: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export const AI_ERROR_CODES = {
  QUOTA_EXCEEDED: "AI_QUOTA_EXCEEDED",
  TIMEOUT: "AI_TIMEOUT",
  POLICY_VIOLATION: "AI_POLICY_VIOLATION",
  SERVER_ERROR: "AI_SERVER_ERROR",
  UNKNOWN: "AI_UNKNOWN_ERROR",
} as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

export * from "./schemas.js";
