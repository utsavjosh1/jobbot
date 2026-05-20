import { generateText, generateVoyageEmbedding } from "@postly/ai-utils";
import { resumeQueries } from "@postly/database";
import type { Resume, ResumeAnalysis } from "@postly/shared-types";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import { logger } from "@postly/logger";

const ResumeAnalysisSchema = z.object({
  skills: z.array(z.string()).default([]),
  experience_years: z.number().default(0),
  education: z.array(z.object({
    degree: z.string().default("Unknown"),
    institution: z.string().default("Unknown"),
    year: z.number().optional(),
    field_of_study: z.string().optional(),
  })).default([]),
  summary: z.string().default(""),
});

function sanitizeForLog(input: string): string {
  return String(input).replace(/[\x00-\x1F\x7F]/g, " ");
}

function cleanJsonResponse(response: string): string {
  let clean = response.trim();
  if (clean.startsWith("```json")) clean = clean.slice(7);
  else if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);
  return clean.trim();
}

function buildEmbeddingText(analysis: ResumeAnalysis): string {
  return `${analysis.summary} Skills: ${analysis.skills.join(", ")} Experience: ${analysis.experience_years} years`;
}

export class ResumeService {
  async parseFile(buffer: Buffer, mimetype: string): Promise<string> {
    if (mimetype === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text.trim();
    }
    if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimetype === "application/msword") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }
    throw new Error(`Unsupported file type: ${mimetype}`);
  }

  async analyzeResume(text: string): Promise<ResumeAnalysis> {
    const prompt = `Analyze the following resume and extract structured information.
Return a valid JSON object with these exact fields:
- skills: array of technical and soft skills mentioned (strings)
- experience_years: estimated total years of professional experience (number)
- education: array of education entries, each with: degree, institution, year (optional), field_of_study (optional)
- summary: a 2-3 sentence professional summary

Resume text:
${text.substring(0, 8000)}

Return ONLY the JSON object, no markdown formatting or explanation.`;

    const { text: response } = await generateText(prompt);

    try {
      const rawParsed = JSON.parse(cleanJsonResponse(response));
      const validated = ResumeAnalysisSchema.safeParse(rawParsed);

      if (!validated.success) {
        logger.warn("LLM output validation failed", { errors: validated.error.issues, rawKeys: Object.keys(rawParsed) });
        return { skills: [], experience_years: 0, education: [], summary: "Unable to fully analyze resume. Please try again." };
      }
      return validated.data;
    } catch (error) {
      logger.error("Failed to parse AI response", { error: error instanceof Error ? sanitizeForLog(error.message) : "Unknown error" });
      return { skills: [], experience_years: 0, education: [], summary: "Unable to analyze resume. Please try again." };
    }
  }

  async processResume(userId: string, fileUrl: string, fileBuffer: Buffer, mimetype: string): Promise<Resume> {
    const resume = await resumeQueries.create(userId, fileUrl);
    try {
      const parsedText = await this.parseFile(fileBuffer, mimetype);
      const analysis = await this.analyzeResume(parsedText);
      const embeddingText = buildEmbeddingText(analysis);
      const { embedding } = await generateVoyageEmbedding(embeddingText);
      return (await resumeQueries.updateAnalysis(resume.id, parsedText, analysis.skills, analysis.experience_years, analysis.education, embedding)) || resume;
    } catch (error) {
      console.error("Error processing resume:", error instanceof Error ? sanitizeForLog(error.message) : "Unknown error");
      return resume;
    }
  }

  async getUserResumes(userId: string): Promise<Resume[]> {
    return resumeQueries.findByUserId(userId);
  }

  async getResumeById(id: string, userId: string): Promise<Resume | null> {
    return resumeQueries.findByIdWithUser(id, userId);
  }

  async deleteResume(id: string, userId: string): Promise<boolean> {
    return resumeQueries.delete(id, userId);
  }

  async reanalyzeResume(id: string, userId: string): Promise<Resume | null> {
    const resume = await resumeQueries.findByIdWithUser(id, userId);
    if (!resume || !resume.parsed_text) return null;

    const analysis = await this.analyzeResume(resume.parsed_text);
    const embeddingText = buildEmbeddingText(analysis);
    const { embedding } = await generateVoyageEmbedding(embeddingText);

    return resumeQueries.updateAnalysis(id, resume.parsed_text, analysis.skills, analysis.experience_years, analysis.education, embedding);
  }
}

export const resumeService = new ResumeService();
