import { generateText, generateVoyageEmbedding } from "@postly/ai-utils";
import { resumeQueries } from "@postly/database";
import type { Resume, ResumeAnalysis } from "@postly/shared-types";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import { logger } from "@postly/logger";

export class ResumeService {
  /**
   * Sanitize text before logging to avoid log injection (e.g. newline injection).
   * Removes control characters (including newlines) and normalizes to a single line.
   */
  private sanitizeForLog(input: string): string {
    return String(input).replace(/[\x00-\x1F\x7F]/g, " ");
  }

  /**
   * Parse file content based on type
   */
  async parseFile(buffer: Buffer, mimetype: string): Promise<string> {
    if (mimetype === "application/pdf") {
      return this.parsePDF(buffer);
    } else if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimetype === "application/msword"
    ) {
      return this.parseDOCX(buffer);
    }
    throw new Error(`Unsupported file type: ${mimetype}`);
  }

  /**
   * Parse PDF file
   */
  private async parsePDF(buffer: Buffer): Promise<string> {
    // Use the class-based API for pdf-parse v2
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text.trim();
  }

  /**
   * Parse DOCX file
   */
  private async parseDOCX(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  /**
   * Zod schema for validating structured LLM output.
   * Prevents malformed AI responses from corrupting downstream data.
   */
  private static ResumeAnalysisSchema = z.object({
    skills: z.array(z.string()).default([]),
    experience_years: z.number().default(0),
    education: z
      .array(
        z.object({
          degree: z.string().default("Unknown"),
          institution: z.string().default("Unknown"),
          year: z.number().optional(),
          field_of_study: z.string().optional(),
        }),
      )
      .default([]),
    summary: z.string().default(""),
  });

  /**
   * Analyze resume text using AI with Zod-validated output.
   */
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
      // Clean up response - remove markdown code blocks if present
      let cleanJson = response.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.slice(7);
      } else if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.slice(3);
      }
      if (cleanJson.endsWith("```")) {
        cleanJson = cleanJson.slice(0, -3);
      }
      cleanJson = cleanJson.trim();

      const rawParsed = JSON.parse(cleanJson);
      const validated = ResumeService.ResumeAnalysisSchema.safeParse(rawParsed);

      if (!validated.success) {
        logger.warn("LLM output validation failed", {
          errors: validated.error.issues,
          rawKeys: Object.keys(rawParsed),
        });
        return {
          skills: [],
          experience_years: 0,
          education: [],
          summary: "Unable to fully analyze resume. Please try again.",
        };
      }

      return validated.data;
    } catch (error) {
      logger.error("Failed to parse AI response", {
        error:
          error instanceof Error
            ? this.sanitizeForLog(error.message)
            : "Unknown error",
      });
      // Return default analysis if parsing fails
      return {
        skills: [],
        experience_years: 0,
        education: [],
        summary: "Unable to analyze resume. Please try again.",
      };
    }
  }

  /**
   * Process uploaded resume: parse, analyze, generate embedding, and save
   */
  async processResume(
    userId: string,
    fileUrl: string,
    fileBuffer: Buffer,
    mimetype: string,
  ): Promise<Resume> {
    // 1. Create initial resume record
    const resume = await resumeQueries.create(userId, fileUrl);

    try {
      // 2. Parse file content
      const parsedText = await this.parseFile(fileBuffer, mimetype);

      // 3. Analyze resume with AI
      const analysis = await this.analyzeResume(parsedText);

      // 4. Generate embedding for vector search
      const embeddingText = `${analysis.summary} Skills: ${analysis.skills.join(", ")} Experience: ${analysis.experience_years} years`;
      const { embedding } = await generateVoyageEmbedding(embeddingText);

      // 5. Update resume with analysis
      const updatedResume = await resumeQueries.updateAnalysis(
        resume.id,
        parsedText,
        analysis.skills,
        analysis.experience_years,
        analysis.education,
        embedding,
      );

      return updatedResume || resume;
    } catch (error) {
      // Safe error logging to avoid log injection
      console.error(
        "Error processing resume:",
        error instanceof Error
          ? this.sanitizeForLog(error.message)
          : "Unknown error",
      );
      // The user can retry analysis later
      return resume;
    }
  }

  /**
   * Get all resumes for a user
   */
  async getUserResumes(userId: string): Promise<Resume[]> {
    return resumeQueries.findByUserId(userId);
  }

  /**
   * Get a specific resume by ID
   */
  async getResumeById(id: string, userId: string): Promise<Resume | null> {
    return resumeQueries.findByIdWithUser(id, userId);
  }

  /**
   * Delete a resume
   */
  async deleteResume(id: string, userId: string): Promise<boolean> {
    return resumeQueries.delete(id, userId);
  }

  /**
   * Re-analyze an existing resume
   */
  async reanalyzeResume(id: string, userId: string): Promise<Resume | null> {
    const resume = await resumeQueries.findByIdWithUser(id, userId);
    if (!resume || !resume.parsed_text) {
      return null;
    }

    const analysis = await this.analyzeResume(resume.parsed_text);
    const embeddingText = `${analysis.summary} Skills: ${analysis.skills.join(", ")} Experience: ${analysis.experience_years} years`;
    const { embedding } = await generateVoyageEmbedding(embeddingText);

    return resumeQueries.updateAnalysis(
      id,
      resume.parsed_text,
      analysis.skills,
      analysis.experience_years,
      analysis.education,
      embedding,
    );
  }
}

export const resumeService = new ResumeService();
