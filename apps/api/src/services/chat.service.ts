import { streamText, generateText } from "@postly/ai-utils";
import { conversationQueries, resumeQueries, jobQueries, userQueries } from "@postly/database";
import { matchingService } from "./matching.service.js";
import type { StreamChatResponse, MessageMetadata, Message, Job, OptimizedJobMatch } from "@postly/shared-types";
import { logger } from "@postly/logger";

interface MatchedJob extends Job {
  match_score: number;
  ai_explanation?: string;
}

interface JobIntent {
  isRelated: boolean;
  isSpecific: boolean;
  techKeywords: string[];
  allKeywords: string[];
}

const JOB_KEYWORDS = [
  "job","career","hiring","opportunity","opening","position","vacancy","work","hire",
  "recruiting","talent","apply","application","resume","cv","salary","role",
  "looking for","hunting","find","search","offer","interview","employer","company",
  "staff","manager","engineer","designer","architect","developer","sales","marketing",
  "doctor","nurse","teacher","driver","chef","accounting","legal","retail",
  "remote","hybrid","fullstack","frontend","backend",
];

const MAX_CONTEXT_TOKENS = 8000;

const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+a/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
  /what\s+(are|is)\s+your\s+(system\s+)?instructions/i,
  /disregard\s+(all|any)\s+(prior|previous)/i,
];

function getJobIntent(message: string): JobIntent {
  const lowercaseMsg = message.toLowerCase();
  const foundKeywords = JOB_KEYWORDS.filter((kw) => lowercaseMsg.includes(kw));
  return {
    isRelated: foundKeywords.length > 0 || message.length > 50,
    isSpecific: foundKeywords.length > 2,
    techKeywords: [],
    allKeywords: foundKeywords,
  };
}

function trimHistory(messages: Message[], maxTokens: number): string {
  let budget = maxTokens;
  const included: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = `${messages[i].role}: ${messages[i].content}`;
    const estimatedTokens = Math.ceil(entry.length / 4);
    if (budget - estimatedTokens < 0) break;
    budget -= estimatedTokens;
    included.unshift(entry);
  }
  return included.join("\n");
}

function sanitizeUserInput(message: string): string {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(message)) {
      logger.warn("Prompt injection attempt detected", { pattern: pattern.source, messageLength: message.length });
      return "[Message filtered for policy compliance. Please rephrase your question about jobs or career advice.]";
    }
  }
  return message;
}

function toOptimizedJobMatch(job: MatchedJob): OptimizedJobMatch {
  const formatSalary = (min?: number, max?: number): string | undefined => {
    if (!min && !max) return undefined;
    if (min && max) return `$${(min / 1000).toFixed(0)}k - $${(max / 1000).toFixed(0)}k`;
    if (min) return `$${(min / 1000).toFixed(0)}k+`;
    return `Up to $${(max! / 1000).toFixed(0)}k`;
  };
  return {
    id: job.id,
    display_info: { title: job.title, company: job.company_name, location: job.location || "Remote", logo_url: undefined, source: job.source },
    matching_data: { match_score: job.match_score, ai_explanation: job.ai_explanation, key_skills: job.skills_required || [] },
    meta: { posted_at: job.posted_at?.toISOString(), apply_url: job.source_url, remote: job.remote, salary_range: formatSalary(job.salary_min, job.salary_max) },
  };
}

function isNonEmployer(role: string): boolean {
  return role !== "employer" && role !== "admin";
}

function buildSystemPrompt(userRole: string, resumeContext: string, jobContext: string): string {
  const isSeeker = isNonEmployer(userRole);
  const roleInstruction = userRole === "employer"
    ? "You are an AI assistant helping an employer looking to hire candidates. Focus STRICTLY on hiring, evaluating candidates, and posting jobs."
    : "You are an AI career assistant helping with resume analysis and job search.";

  const seekerCaps = isSeeker
    ? "\nYour capabilities:\n- Analyze resumes and provide constructive feedback\n- Suggest relevant job opportunities from our database\n- Offer career advice and interview tips\n- Help with job applications\n"
    : "";

  const instruction1 = userRole === "employer"
    ? "Focus STRICTLY on helping the employer with hiring. UNDER NO CIRCUMSTANCES should you suggest job listings or career advice to an employer."
    : "When the user explicitly asks for jobs or career opportunities, reference the jobs listed below. If they say 'hi' or make small talk, respond conversationally without bringing up jobs.";

  const seekerExtra = isSeeker
    ? "\n3. DO NOT hallucinate job listings. Only mention jobs explicitly listed in the context below.\n4. If the user asks for jobs and none are listed, inform the user that no jobs are currently available."
    : "";

  return `${roleInstruction}${seekerCaps}
IMPORTANT INSTRUCTIONS:
1. ${instruction1}
2. DO NOT invent or hallucinate facts.${seekerExtra}

Be professional, encouraging, and concise.${resumeContext}${isSeeker ? jobContext : ""}`;
}

export class ChatService {
  async *streamChatResponse(
    conversationId: string, userId: string, userMessage: string, resumeId?: string,
  ): AsyncGenerator<StreamChatResponse> {
    try {
      await conversationQueries.createMessage(conversationId, "user", userMessage);

      const [conversation, user] = await Promise.all([
        conversationQueries.findById(conversationId, userId),
        userQueries.findById(userId),
      ]);
      if (!conversation) throw new Error("Conversation not found");

      const userRole = user?.roles[0] || "job_seeker";
      const messages = await conversationQueries.getMessages(conversationId);
      const effectiveResumeId = resumeId || conversation.resume_id;
      const intent = getJobIntent(userMessage);

      let resumeContext = "";
      let jobMatches: MatchedJob[] = [];
      const seekerContext = isNonEmployer(userRole);

      if (effectiveResumeId) {
        const resume = await resumeQueries.findById(effectiveResumeId);
        if (resume?.parsed_text) {
          resumeContext = `\n\nUser's Resume Summary:\n- Skills: ${resume.skills?.join(", ") || "Not specified"}\n- Experience: ${resume.experience_years || 0} years\n- Summary: ${resume.parsed_text.substring(0, 1000)}`;
          if (seekerContext && intent.isRelated) {
            try { jobMatches = await matchingService.findMatchingJobs(effectiveResumeId, userId, 5); }
            catch { /* silently fail */ }
          }
        }
        if (!conversation.resume_id && resumeId) {
          await conversationQueries.updateResumeId(conversationId, resumeId);
        }
      }

      if (jobMatches.length === 0 && seekerContext && intent.isRelated) {
        try {
          const recentJobs = await jobQueries.findActive(undefined, 5, 0);
          jobMatches = recentJobs.map((job: Job) => ({ ...job, match_score: 0 }));
        } catch { /* silently fail */ }
      }

      if (intent.isSpecific && jobMatches.length > 0) {
        jobMatches = jobMatches.filter((job) => {
          const searchSpace = `${job.title || ""} ${job.description || ""} ${job.skills_required?.join(" ") || ""}`.toLowerCase();
          if (intent.techKeywords.length > 0) return intent.techKeywords.some((kw) => searchSpace.includes(kw));
          return intent.allKeywords.some((kw) => searchSpace.includes(kw));
        });
      }

      let jobContext = "";
      if (jobMatches.length > 0) {
        const hasResume = !!effectiveResumeId;
        jobContext = `\n\n${hasResume ? "Matching" : "Available"} job opportunities from our database:\n${jobMatches
          .map((j, i) => `${i + 1}. ${j.title} at ${j.company_name}${hasResume && j.match_score > 0 ? ` (${j.match_score}% match)` : ""} - ${j.location || "Remote"}`)
          .join("\n")}`;
      }

      const systemPrompt = buildSystemPrompt(userRole, resumeContext, jobContext);
      const sanitizedMessage = sanitizeUserInput(userMessage);
      const conversationHistory = trimHistory(messages.filter((m: Message) => m.role !== "system"), MAX_CONTEXT_TOKENS);
      const fullPrompt = `${systemPrompt}\n\nConversation:\n${conversationHistory}\nuser: ${sanitizedMessage}\nassistant:`;

      let fullResponse = "";
      const metadata: MessageMetadata = {};
      const streamResult = await streamText(fullPrompt);

      for await (const chunk of streamResult.stream) {
        fullResponse += chunk;
        yield { type: "chunk", content: chunk };
      }

      const streamMeta = streamResult.getMetadata();
      metadata.usage = {
        prompt_tokens: streamMeta.promptTokens,
        completion_tokens: streamMeta.completionTokens,
        total_tokens: streamMeta.totalTokens,
      };

      if (jobMatches.length > 0) {
        metadata.job_matches = jobMatches.map(toOptimizedJobMatch);
      }

      const savedMsg = await conversationQueries.createMessage(
        conversationId, "assistant", fullResponse, metadata.usage?.total_tokens, metadata,
      );

      if (messages.length === 0) {
        const titlePrompt = `Generate a short 3-5 word title for this conversation. User's first message: "${userMessage}". Return ONLY the title, no quotes or explanation.`;
        const { text: title } = await generateText(titlePrompt);
        await conversationQueries.updateTitle(conversationId, title.trim().substring(0, 50));
      }

      if (jobMatches.length > 0) {
        yield { type: "metadata", metadata: { job_matches: jobMatches.map(toOptimizedJobMatch) } };
      }

      yield { type: "complete", message_id: savedMsg.id, metadata };
    } catch (error) {
      console.error("Chat service error:", error);
      yield { type: "error", error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
  }
}
