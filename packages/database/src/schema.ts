import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  decimal,
  vector,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

export const userRoleEnum = pgEnum("user_role", [
  "job_seeker",
  "employer",
  "admin",
  "discord_owner",
]);
export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "under_review",
  "phone_screen",
  "interviewed",
  "offer_extended",
  "accepted",
  "rejected",
  "withdrawn",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "cancelled",
  "past_due",
  "trialing",
  "paused",
  "expired",
]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "seeker",
  "employer",
  "discord_owner",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "disputed",
]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
  "bounced",
  "opened",
]);
export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  "push",
  "in_app",
]);
export const botPlatformEnum = pgEnum("bot_platform", [
  "discord",
  "reddit",
  "twitter",
]);
export const jobSourceEnum = pgEnum("job_source", [
  "indeed",
  "linkedin",
  "company_direct",
  "remote_co",
  "remote_ok",
  "weworkremotely",
  "google_jobs",
  "generic",
  "remotive",
  "arbeitnow",
  "greenhouse",
  "hiring_cafe",
  "internal",
]);
export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// USERS & AUTH
// ═══════════════════════════════════════════════════════════════════════════════

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password_hash: varchar("password_hash", { length: 255 }),
    full_name: varchar("full_name", { length: 255 }),
    avatar_url: text("avatar_url"),
    roles: userRoleEnum("roles").array().notNull().default(["job_seeker"]),
    is_verified: boolean("is_verified").default(false),
    email_verified_at: timestamp("email_verified_at", { withTimezone: true }),
    // 'email', 'google', 'discord' — null means email/password
    auth_provider: varchar("auth_provider", { length: 50 }),
    timezone: varchar("timezone", { length: 50 }),
    locale: varchar("locale", { length: 20 }),
    password_reset_token: varchar("password_reset_token", { length: 255 }),
    password_reset_expires_at: timestamp("password_reset_expires_at", {
      withTimezone: true,
    }),
    last_login_at: timestamp("last_login_at", { withTimezone: true }),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    emailIdx: index("idx_users_email").on(table.email),
    rolesIdx: index("idx_users_role").on(table.roles),
  }),
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token_hash: varchar("token_hash", { length: 255 }).notNull().unique(),
  refresh_token_hash: varchar("refresh_token_hash", { length: 255 }).unique(),
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: text("user_agent"),
  last_active_at: timestamp("last_active_at", {
    withTimezone: true,
  }).defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const otp_codes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    code_hash: varchar("code_hash", { length: 255 }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    last_attempt_at: timestamp("last_attempt_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_otp_user").on(table.user_id),
    expiresIdx: index("idx_otp_expires").on(table.expires_at),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════════════════════════════════════════

export const seeker_profiles = pgTable(
  "seeker_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    headline: varchar("headline", { length: 2000 }),
    summary: text("summary"),
    skills: jsonb("skills"),
    experience_years: integer("experience_years"),
    experience_level: varchar("experience_level", { length: 50 }),
    education: jsonb("education"),
    certifications: jsonb("certifications"),
    languages: jsonb("languages"),
    work_history: jsonb("work_history"),
    desired_job_titles: jsonb("desired_job_titles"),
    desired_locations: jsonb("desired_locations"),
    desired_salary_min: decimal("desired_salary_min", {
      precision: 10,
      scale: 2,
    }),
    desired_salary_max: decimal("desired_salary_max", {
      precision: 10,
      scale: 2,
    }),
    desired_job_type: varchar("desired_job_type", { length: 50 }),
    open_to_remote: boolean("open_to_remote").default(true),
    open_to_relocation: boolean("open_to_relocation").default(false),
    embedding: vector("embedding", { dimensions: 1024 }),
    prompt_history_summary: text("prompt_history_summary"),
    last_parsed_at: timestamp("last_parsed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index("idx_seeker_profiles_user").on(table.user_id),
  }),
);

export const employer_profiles = pgTable(
  "employer_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    company_name: varchar("company_name", { length: 255 }).notNull(),
    company_website: text("company_website"),
    company_logo_url: text("company_logo_url"),
    company_description: text("company_description"),
    company_size: varchar("company_size", { length: 50 }),
    industry: varchar("industry", { length: 150 }),
    headquarters_location: varchar("headquarters_location", { length: 255 }),
    social_links: jsonb("social_links"),
    embedding: vector("embedding", { dimensions: 1024 }),
    active_job_count: integer("active_job_count").default(0),
    is_verified: boolean("is_verified").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index("idx_employer_profiles_user").on(table.user_id),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMES
// ═══════════════════════════════════════════════════════════════════════════════

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    file_url: text("file_url").notNull(),
    // SHA-256 for dedup
    file_hash: varchar("file_hash", { length: 64 }),
    file_size_bytes: integer("file_size_bytes"),
    file_mimetype: varchar("file_mimetype", { length: 100 }),
    parsed_text: text("parsed_text"),
    embedding: vector("embedding", { dimensions: 1024 }),
    skills: jsonb("skills"),
    experience_years: integer("experience_years"),
    education: jsonb("education"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index("idx_resumes_user").on(table.user_id),
    fileHashIdx: index("idx_resumes_file_hash").on(table.file_hash),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// JOBS
// ═══════════════════════════════════════════════════════════════════════════════

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    company_name: varchar("company_name", { length: 255 }).notNull(),
    company_logo_url: text("company_logo_url"),
    company_description: text("company_description"),
    description: text("description").notNull(),
    location: varchar("location", { length: 255 }),
    salary_min: decimal("salary_min", { precision: 10, scale: 2 }),
    salary_max: decimal("salary_max", { precision: 10, scale: 2 }),
    job_type: varchar("job_type", { length: 50 }),
    remote: boolean("remote").default(false),
    source: jobSourceEnum("source").notNull(),
    source_url: text("source_url"),
    embedding: vector("embedding", { dimensions: 1024 }),
    skills_required: jsonb("skills_required"),
    experience_required: varchar("experience_required", { length: 100 }),
    posted_at: timestamp("posted_at", { withTimezone: true }),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    is_active: boolean("is_active").default(true),
    employer_id: uuid("employer_id").references(() => users.id),
    external_job_id: varchar("external_job_id", { length: 255 }),
    fingerprint: varchar("fingerprint", { length: 64 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("idx_jobs_company").on(table.company_name),
    activeIdx: index("idx_jobs_active").on(table.is_active),
    sourceIdx: index("idx_jobs_source").on(table.source),
    employerIdx: index("idx_jobs_employer").on(table.employer_id),
    remoteActiveIdx: index("idx_jobs_remote_active")
      .on(table.remote, table.is_active)
      .where(sql`${table.is_active} = true`),
    activePostedIdx: index("idx_jobs_active_posted")
      .on(table.is_active, table.posted_at)
      .where(sql`${table.is_active} = true`),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// JOB MATCHES
// ═══════════════════════════════════════════════════════════════════════════════

export const job_matches = pgTable(
  "job_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resume_id: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    job_id: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    match_score: decimal("match_score", { precision: 5, scale: 2 }).notNull(),
    ai_explanation: text("ai_explanation"),
    is_saved: boolean("is_saved").default(false),
    applied: boolean("applied").default(false),
    viewed_at: timestamp("viewed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    uniqueMatch: unique().on(table.user_id, table.job_id),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
// ONLY for jobs created on our platform (where employer_id IS NOT NULL).

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seeker_id: uuid("seeker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    job_id: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    resume_id: uuid("resume_id").references(() => resumes.id),
    status: applicationStatusEnum("status").notNull().default("applied"),
    cover_letter: text("cover_letter"),
    seeker_notes: text("seeker_notes"),
    employer_notes: text("employer_notes"),
    notify_seeker: boolean("notify_seeker").default(true),
    notify_employer: boolean("notify_employer").default(true),
    applied_at: timestamp("applied_at", { withTimezone: true }).defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    seekerJobUnique: unique().on(table.seeker_id, table.job_id),
    seekerIdx: index("idx_applications_seeker").on(
      table.seeker_id,
      table.created_at,
    ),
    jobIdx: index("idx_applications_job").on(table.job_id, table.status),
  }),
);

export const application_status_history = pgTable(
  "application_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    application_id: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    from_status: applicationStatusEnum("from_status"),
    to_status: applicationStatusEnum("to_status").notNull(),
    changed_by: uuid("changed_by").references(() => users.id),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    applicationIdx: index("idx_app_history_application").on(
      table.application_id,
      table.created_at,
    ),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// AI CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const system_prompts = pgTable("system_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  content: text("content").notNull(),
  is_active: boolean("is_active").default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    resume_id: uuid("resume_id").references(() => resumes.id),
    model: varchar("model", { length: 100 }),
    total_tokens_used: integer("total_tokens_used").default(0),
    is_archived: boolean("is_archived").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_conversations_user").on(table.user_id),
    userActiveIdx: index("idx_conversations_user_active")
      .on(table.user_id)
      .where(sql`is_archived = false`),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    tokens_used: integer("tokens_used"),
    metadata: jsonb("metadata"),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    conversationIdx: index("idx_messages_conversation").on(
      table.conversation_id,
      table.created_at,
    ),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// BOTS & SOCIAL
// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: discord_configs is DEPRECATED. Use bot_configs with platform='discord' instead.
// Migrate: INSERT INTO bot_configs (user_id, platform, target_id, is_active, ...)
//          SELECT user_id, 'discord', guild_id, is_active, ... FROM discord_configs;

export const bot_configs = pgTable(
  "bot_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: botPlatformEnum("platform").notNull(),
    is_active: boolean("is_active").default(true),
    // Platform-specific config (guild_id, channel_id, subreddit, hashtags, etc.)
    platform_config: jsonb("platform_config"),
    // Encrypted credentials (AES-256-GCM at application layer)
    credentials: jsonb("credentials"),
    target_id: varchar("target_id", { length: 255 }),
    target_name: varchar("target_name", { length: 255 }),
    webhook_url: text("webhook_url"),
    // Niche filtering: what type of jobs to dispatch
    filter_keywords: text("filter_keywords").array(),
    filter_locations: text("filter_locations").array(),
    filter_min_salary: decimal("filter_min_salary", {
      precision: 10,
      scale: 2,
    }),
    filter_job_types: varchar("filter_job_types", { length: 255 }).array(),
    // Error tracking
    last_error: text("last_error"),
    error_count: integer("error_count").default(0),
    last_post_at: timestamp("last_post_at", { withTimezone: true }),
    last_success_at: timestamp("last_success_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userPlatformUnique: unique().on(t.user_id, t.platform),
    userIdx: index("idx_bot_configs_user").on(t.user_id),
    activePlatformIdx: index("idx_bot_configs_active")
      .on(t.platform, t.is_active)
      .where(sql`${t.is_active} = true`),
  }),
);

// DEPRECATED: Use bot_configs instead. Will be removed after migration.
export const discord_configs = pgTable(
  "discord_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guild_id: varchar("guild_id", { length: 255 }).notNull().unique(),
    channel_id: varchar("channel_id", { length: 255 }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    guildIdx: index("idx_discord_guild").on(table.guild_id),
  }),
);

export const bot_posts = pgTable(
  "bot_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bot_config_id: uuid("bot_config_id")
      .notNull()
      .references(() => bot_configs.id, { onDelete: "cascade" }),
    job_id: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    external_post_id: varchar("external_post_id", { length: 255 }),
    status: varchar("status", { length: 30 }).default("sent"),
    error_message: text("error_message"),
    posted_at: timestamp("posted_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    configIdx: index("idx_bot_posts_config").on(
      table.bot_config_id,
      table.posted_at,
    ),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING
// ═══════════════════════════════════════════════════════════════════════════════

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    plan: subscriptionPlanEnum("plan").notNull(),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    dodo_subscription_id: varchar("dodo_subscription_id", {
      length: 255,
    }).unique(),
    dodo_customer_id: varchar("dodo_customer_id", { length: 255 }),
    dodo_product_id: varchar("dodo_product_id", { length: 255 }),
    current_period_start: timestamp("current_period_start", {
      withTimezone: true,
    }),
    current_period_end: timestamp("current_period_end", { withTimezone: true }),
    trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    raw_data: jsonb("raw_data"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    statusIdx: index("idx_subscriptions_status").on(table.status),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subscription_id: uuid("subscription_id").references(() => subscriptions.id),
    dodo_payment_id: varchar("dodo_payment_id", { length: 255 }),
    dodo_customer_id: varchar("dodo_customer_id", { length: 255 }),
    event_type: varchar("event_type", { length: 100 }),
    amount: integer("amount").notNull(), //  Amount in USD cents (e.g., 999 = $9.99)
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    status: paymentStatusEnum("status").notNull(),
    payment_method: varchar("payment_method", { length: 50 }), // 'card', 'paypal', etc.
    paid_at: timestamp("paid_at", { withTimezone: true }),
    raw_payload: jsonb("raw_payload"),
    // Prevents duplicate webhook processing
    idempotency_key: varchar("idempotency_key", { length: 255 })
      .notNull()
      .unique(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_payments_user").on(table.user_id, table.created_at),
    dodoPaymentIdx: index("idx_payments_dodo").on(table.dodo_payment_id),
  }),
);

export const plan_features = pgTable("plan_features", {
  plan: subscriptionPlanEnum("plan").primaryKey(),
  max_resumes: integer("max_resumes").notNull().default(0),
  max_conversations: integer("max_conversations").notNull().default(0),
  max_bot_configs: integer("max_bot_configs").notNull().default(0),
  tokens_per_month: integer("tokens_per_month").notNull().default(0),
  tokens_rollover: boolean("tokens_rollover").notNull().default(false),
  ai_model: varchar("ai_model", { length: 50 })
    .notNull()
    .default("gpt-4o-mini"),
  features: jsonb("features").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const subscription_change_log = pgTable(
  "subscription_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    from_subscription_id: varchar("from_subscription_id", { length: 255 }),
    to_subscription_id: varchar("to_subscription_id", {
      length: 255,
    }).notNull(),
    from_plan: subscriptionPlanEnum("from_plan"),
    to_plan: subscriptionPlanEnum("to_plan").notNull(),
    reason: varchar("reason", { length: 100 }), // 'upgrade', 'downgrade', 'cancel', 'reactivate'
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_sub_change_user").on(table.user_id),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull().default("email"),
    type: varchar("type", { length: 100 }),
    subject: varchar("subject", { length: 500 }).notNull(),
    content: text("content").notNull(),
    to_email: varchar("to_email", { length: 255 }).notNull(),
    status: notificationStatusEnum("status").notNull().default("pending"),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
    read_at: timestamp("read_at", { withTimezone: true }),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pendingIdx: index("idx_notifications_pending")
      .on(table.user_id, table.status)
      .where(sql`${table.status} = 'pending'`),
  }),
);

export const email_templates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  template_name: varchar("template_name", { length: 100 }).notNull().unique(),
  subject_template: text("subject_template").notNull(),
  html_template: text("html_template").notNull(),
  text_template: text("text_template"),
  variables: jsonb("variables").notNull().default([]),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

export const audit_log = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor_id: uuid("actor_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    entity_type: varchar("entity_type", { length: 100 }),
    entity_id: uuid("entity_id"),
    details: jsonb("details"), // {"before": {...}, "after": {...}}
    ip_address: varchar("ip_address", { length: 45 }),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    actorIdx: index("idx_audit_actor").on(table.actor_id, table.created_at),
    entityIdx: index("idx_audit_entity").on(
      table.entity_type,
      table.entity_id,
      table.created_at,
    ),
  }),
);

export const token_usage = pgTable(
  "token_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    window_start: timestamp("window_start", { withTimezone: true }).notNull(),
    window_type: varchar("window_type", { length: 10 })
      .notNull()
      .default("monthly"),
    tokens_used: integer("tokens_used").notNull().default(0),
  },
  (table) => ({
    userMonthIdx: uniqueIndex("idx_token_usage_monthly").on(
      table.user_id,
      sql`date_trunc('month', ${table.window_start})`,
    ),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ one, many }) => ({
  resumes: many(resumes),
  conversations: many(conversations),
  job_matches: many(job_matches),
  employer_profile: one(employer_profiles, {
    fields: [users.id],
    references: [employer_profiles.user_id],
  }),
  seeker_profile: one(seeker_profiles, {
    fields: [users.id],
    references: [seeker_profiles.user_id],
  }),
  seeker_applications: many(applications, { relationName: "seeker" }),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.user_id],
  }),
  payments: many(payments),
  sessions: many(sessions),
  bot_configs: many(bot_configs),
  notifications: many(notifications),
  audit_logs: many(audit_log),
  token_usage: many(token_usage),
  subscription_changes: many(subscription_change_log),
}));

export const seekerProfilesRelations = relations(
  seeker_profiles,
  ({ one }) => ({
    user: one(users, {
      fields: [seeker_profiles.user_id],
      references: [users.id],
    }),
  }),
);

export const employerProfilesRelations = relations(
  employer_profiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [employer_profiles.user_id],
      references: [users.id],
    }),
    jobs: many(jobs),
  }),
);

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  employer: one(users, { fields: [jobs.employer_id], references: [users.id] }),
  matches: many(job_matches),
  applications: many(applications),
}));

export const jobMatchesRelations = relations(job_matches, ({ one }) => ({
  user: one(users, { fields: [job_matches.user_id], references: [users.id] }),
  resume: one(resumes, {
    fields: [job_matches.resume_id],
    references: [resumes.id],
  }),
  job: one(jobs, { fields: [job_matches.job_id], references: [jobs.id] }),
}));

export const applicationsRelations = relations(
  applications,
  ({ one, many }) => ({
    seeker: one(users, {
      fields: [applications.seeker_id],
      references: [users.id],
      relationName: "seeker",
    }),
    job: one(jobs, { fields: [applications.job_id], references: [jobs.id] }),
    resume: one(resumes, {
      fields: [applications.resume_id],
      references: [resumes.id],
    }),
    status_history: many(application_status_history),
  }),
);

export const applicationStatusHistoryRelations = relations(
  application_status_history,
  ({ one }) => ({
    application: one(applications, {
      fields: [application_status_history.application_id],
      references: [applications.id],
    }),
  }),
);

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [conversations.user_id],
      references: [users.id],
    }),
    resume: one(resumes, {
      fields: [conversations.resume_id],
      references: [resumes.id],
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversation_id],
    references: [conversations.id],
  }),
}));

export const botConfigsRelations = relations(bot_configs, ({ one, many }) => ({
  user: one(users, { fields: [bot_configs.user_id], references: [users.id] }),
  posts: many(bot_posts),
}));

export const botPostsRelations = relations(bot_posts, ({ one }) => ({
  config: one(bot_configs, {
    fields: [bot_posts.bot_config_id],
    references: [bot_configs.id],
  }),
  job: one(jobs, { fields: [bot_posts.job_id], references: [jobs.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.user_id], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.user_id], references: [users.id] }),
  subscription: one(subscriptions, {
    fields: [payments.subscription_id],
    references: [subscriptions.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.user_id], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.user_id], references: [users.id] }),
}));

export const planFeaturesRelations = relations(plan_features, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [plan_features.plan],
    references: [subscriptions.plan],
  }),
}));

export const subscriptionChangeLogRelations = relations(
  subscription_change_log,
  ({ one }) => ({
    user: one(users, {
      fields: [subscription_change_log.user_id],
      references: [users.id],
    }),
  }),
);
