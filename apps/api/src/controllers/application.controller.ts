import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { applicationQueries } from "@postly/database";
import type { JwtPayload } from "../middleware/auth.js";
import type { applicationStatusEnum } from "@postly/database";

type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];

const applySchema = z.object({
  job_id: z.string().uuid(),
  resume_id: z.string().uuid().optional(),
  cover_letter: z.string().max(5000).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "applied",
    "under_review",
    "phone_screen",
    "interviewed",
    "offer_extended",
    "accepted",
    "rejected",
    "withdrawn",
  ]),
  note: z.string().optional(),
});

const updateNotesSchema = z.object({
  notes: z.string().max(5000),
});

export class ApplicationController {
  getMyApplications = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const payload = req.user as JwtPayload;
      const limit = Number(req.query.limit) || 100;
      const offset = Number(req.query.offset) || 0;
      const results = await applicationQueries.findBySeeker(
        payload.id,
        limit,
        offset,
      );
      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  };

  apply = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = applySchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }
      const payload = req.user as JwtPayload;
      const { job_id, resume_id, cover_letter } = validation.data;
      const application = await applicationQueries.create(
        payload.id,
        job_id,
        resume_id,
        cover_letter,
      );
      res.status(201).json({ success: true, data: application });
    } catch (error) {
      next(error);
    }
  };

  // GET /applications/search?company=<name>
  searchByCompany = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const payload = req.user as JwtPayload;
      const company = req.query.company as string;
      if (!company) {
        res.status(400).json({
          success: false,
          error: { message: "Query param 'company' is required" },
        });
        return;
      }
      const results = await applicationQueries.findSeekerApplicationByCompany(
        payload.id,
        company,
      );
      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  };

  getById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const application = await applicationQueries.findById(
        String(req.params.id),
      );
      if (!application) {
        res.status(404).json({
          success: false,
          error: { message: "Application not found" },
        });
        return;
      }
      res.json({ success: true, data: application });
    } catch (error) {
      next(error);
    }
  };

  updateNotes = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = updateNotesSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }
      const payload = req.user as JwtPayload;
      const updated = await applicationQueries.updateNotes(
        String(req.params.id),
        payload.id,
        validation.data.notes,
      );
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };

  deleteApplication = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const payload = req.user as JwtPayload;
      const deleted = await applicationQueries.delete(
        String(req.params.id),
        payload.id,
      );
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { message: "Application not found" },
        });
        return;
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };

  getJobApplicants = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const limit = Number(req.query.limit) || 200;
      const offset = Number(req.query.offset) || 0;
      const results = await applicationQueries.findByJob(
        String(req.params.jobId),
        limit,
        offset,
      );
      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = updateStatusSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }
      const { status, note } = validation.data;
      const updated = await applicationQueries.updateStatus(
        String(req.params.id),
        status as ApplicationStatus,
        note,
      );
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { message: "Application not found" },
        });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };
}
