import { eq, desc, and, ilike } from "drizzle-orm";
import { db } from "../index.js";
import { applications, jobs, application_status_history } from "../schema.js";
import type { ApplicationStatus } from "@postly/shared-types";

export const applicationQueries = {
  async create(
    seekerId: string,
    jobId: string,
    resumeId?: string,
    coverLetter?: string,
  ) {
    const [result] = await db.transaction(async (tx) => {
      const [app] = await tx
        .insert(applications)
        .values({
          seeker_id: seekerId,
          job_id: jobId,
          resume_id: resumeId,
          cover_letter: coverLetter,
          status: "applied",
        })
        .returning();

      await tx.insert(application_status_history).values({
        application_id: app.id,
        to_status: "applied",
        changed_by: seekerId,
      });

      return [app];
    });

    return result;
  },

  async findById(id: string) {
    const [result] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));

    return result ?? null;
  },

  async findBySeeker(seekerId: string, limit = 100, offset = 0) {
    return db
      .select({
        application: applications,
        job: {
          title: jobs.title,
          company_name: jobs.company_name,
          location: jobs.location,
          remote: jobs.remote,
          source_url: jobs.source_url,
        },
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.job_id, jobs.id))
      .where(and(eq(applications.seeker_id, seekerId)))
      .orderBy(desc(applications.applied_at))
      .limit(limit)
      .offset(offset);
  },

  // Enables the "Who is Company X? When did I apply?" prompt use-case.
  async findSeekerApplicationByCompany(seekerId: string, companyName: string) {
    return db
      .select({
        application: applications,
        job: {
          title: jobs.title,
          company_name: jobs.company_name,
          location: jobs.location,
          source_url: jobs.source_url,
        },
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.job_id, jobs.id))
      .where(
        and(
          eq(applications.seeker_id, seekerId),
          ilike(jobs.company_name, `%${companyName}%`),
        ),
      )
      .orderBy(desc(applications.applied_at));
  },

  // Get employer's full applicant pipeline for a job.
  async findByJob(jobId: string, limit = 200, offset = 0) {
    return db
      .select()
      .from(applications)
      .where(eq(applications.job_id, jobId))
      .orderBy(desc(applications.applied_at))
      .limit(limit)
      .offset(offset);
  },

  async updateStatus(
    id: string,
    status: ApplicationStatus,
    note?: string,
    actorId?: string,
  ) {
    const [result] = await db.transaction(async (tx) => {
      const [app] = await tx
        .update(applications)
        .set({
          status,
          updated_at: new Date(),
        })
        .where(eq(applications.id, id))
        .returning();

      if (app) {
        await tx.insert(application_status_history).values({
          application_id: id,
          to_status: status,
          note,
          changed_by: actorId,
        });
      }

      return [app];
    });

    return result ?? null;
  },

  async updateNotes(id: string, actorId: string, notes: string) {
    const [result] = await db
      .update(applications)
      .set({
        notes,
        updated_at: new Date(),
      })
      .where(and(eq(applications.id, id), eq(applications.seeker_id, actorId)))
      .returning();

    return result ?? null;
  },

  async delete(id: string, seekerId: string) {
    const [result] = await db
      .delete(applications)
      .where(and(eq(applications.id, id), eq(applications.seeker_id, seekerId)))
      .returning({ id: applications.id });

    return !!result;
  },
};
