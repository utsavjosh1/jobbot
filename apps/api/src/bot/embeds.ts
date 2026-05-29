import { EmbedBuilder, type APIEmbedField } from "discord.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBED_COLOR = 0x3498db;
const DESCRIPTION_MAX = 1024;
const TITLE_MAX = 256;
const FIELD_VALUE_MAX = 1024;
const FOOTER_TEXT = "Powered by Postly | Daily Job Alerts";
const DEFAULT_URL = "https://postly.learnest.asia/";

// Reusable field templates – allocated once so the GC doesn't churn
const FIELD_COMPANY = (v: string): APIEmbedField => ({
  name: "\u{1f3e2} Company",
  value: v.slice(0, FIELD_VALUE_MAX),
  inline: true,
});
const FIELD_LOCATION = (v: string): APIEmbedField => ({
  name: "\u{1f4cd} Location",
  value: v.slice(0, FIELD_VALUE_MAX),
  inline: true,
});
const FIELD_SALARY = (v: string): APIEmbedField => ({
  name: "\u{1f4b0} Salary",
  value: v.slice(0, FIELD_VALUE_MAX),
  inline: true,
});
const FIELD_TYPE = (v: string): APIEmbedField => ({
  name: "\u{1f552} Type",
  value: v.slice(0, FIELD_VALUE_MAX),
  inline: true,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobRow {
  id: string;
  title: string;
  company_name: string;
  description?: string | null;
  location?: string | null;
  salary_min?: string | number | null;
  salary_max?: string | number | null;
  job_type?: string | null;
  remote?: boolean | null;
  source_url?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function fmt(val: unknown): string {
  if (val == null) return "?";
  return String(val);
}

// ---------------------------------------------------------------------------
// Builders – O(1) allocations per call, no intermediate arrays
// ---------------------------------------------------------------------------

/**
 * Build a rich embed for a single job.
 * At most 6 fields + title + description + footer = well within Discord limits.
 */
export function buildJobEmbed(job: JobRow): EmbedBuilder {
  const title = clamp(job.title, TITLE_MAX);
  const desc = clamp(
    job.description ?? "No description provided.",
    DESCRIPTION_MAX,
  );
  const location = job.location ?? (job.remote ? "Remote" : "N/A");
  const salary = `${fmt(job.salary_min)} – ${fmt(job.salary_max)}`;

  const embed = new EmbedBuilder()
    .setTitle(`\u{1f680} ${title}`)
    .setDescription(desc)
    .setURL(job.source_url ?? DEFAULT_URL)
    .setColor(EMBED_COLOR)
    .addFields(
      FIELD_COMPANY(job.company_name),
      FIELD_LOCATION(location),
      FIELD_SALARY(salary),
    );

  if (job.job_type) {
    embed.addFields(FIELD_TYPE(job.job_type));
  }

  embed.setFooter({ text: FOOTER_TEXT });
  return embed;
}

/**
 * Build a compact list embed for multiple jobs (used for previews / test dispatches).
 */
export function buildJobListEmbed(
  jobs: JobRow[],
  page = 1,
  totalPages = 1,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("\u{1f4c5} Daily Job Highlights")
    .setDescription(
      `Here are the latest job matches for your server. (Page ${page}/${totalPages})`,
    )
    .setColor(0x2ecc71);

  for (const job of jobs.slice(0, 5)) {
    embed.addFields({
      name: `${job.title} @ ${job.company_name}`,
      value: `[View Job](${job.source_url ?? DEFAULT_URL})`,
      inline: false,
    });
  }

  embed.setFooter({ text: "Type /setup to change notification settings." });
  return embed;
}
