import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { applicationQueries } from "@postly/database";
import type { JwtPayload } from "../middleware/auth.js";
import type { applicationStatusEnum } from "@postly/database";

type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];

const applySchema = z.object({ job_id: z.string().uuid(), resume_id: z.string().uuid().optional(), cover_letter: z.string().max(5000).optional() });
const updateStatusSchema = z.object({
  status: z.enum(["applied","under_review","phone_screen","interviewed","offer_extended","accepted","rejected","withdrawn"]),
  note: z.string().optional(),
});
const updateNotesSchema = z.object({ notes: z.string().max(5000) });

function userFromRequest(req: Request): string {
  return (req.user as JwtPayload).id;
}

export class ApplicationController {
  getMyApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const results = await applicationQueries.findBySeeker(userFromRequest(req), Number(req.query.limit) || 100, Number(req.query.offset) || 0);
      res.json({ success: true, data: results });
    } catch (error) { next(error); }
  };

  apply = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = applySchema.safeParse(req.body);
      if (!validation.success) { res.status(400).json({ success: false, error: { message: validation.error.errors[0].message } }); return; }
      const { job_id, resume_id, cover_letter } = validation.data;
      const application = await applicationQueries.create(userFromRequest(req), job_id, resume_id, cover_letter);
      res.status(201).json({ success: true, data: application });
    } catch (error) { next(error); }
  };

  searchByCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const company = req.query.company as string;
      if (!company) { res.status(400).json({ success: false, error: { message: "Query param 'company' is required" } }); return; }
      const results = await applicationQueries.findSeekerApplicationByCompany(userFromRequest(req), company);
      res.json({ success: true, data: results });
    } catch (error) { next(error); }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const application = await applicationQueries.findById(req.params.id);
      if (!application) { res.status(404).json({ success: false, error: { message: "Application not found" } }); return; }
      res.json({ success: true, data: application });
    } catch (error) { next(error); }
  };

  updateNotes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = updateNotesSchema.safeParse(req.body);
      if (!validation.success) { res.status(400).json({ success: false, error: { message: validation.error.errors[0].message } }); return; }
      const updated = await applicationQueries.updateNotes(req.params.id, userFromRequest(req), validation.data.notes);
      res.json({ success: true, data: updated });
    } catch (error) { next(error); }
  };

  deleteApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await applicationQueries.delete(req.params.id, userFromRequest(req));
      if (!deleted) { res.status(404).json({ success: false, error: { message: "Application not found" } }); return; }
      res.json({ success: true, data: { deleted: true } });
    } catch (error) { next(error); }
  };

  getJobApplicants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const results = await applicationQueries.findByJob(req.params.jobId, Number(req.query.limit) || 200, Number(req.query.offset) || 0);
      res.json({ success: true, data: results });
    } catch (error) { next(error); }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = updateStatusSchema.safeParse(req.body);
      if (!validation.success) { res.status(400).json({ success: false, error: { message: validation.error.errors[0].message } }); return; }
      const updated = await applicationQueries.updateStatus(req.params.id, validation.data.status as ApplicationStatus, validation.data.note);
      if (!updated) { res.status(404).json({ success: false, error: { message: "Application not found" } }); return; }
      res.json({ success: true, data: updated });
    } catch (error) { next(error); }
  };
}
