import { Request, Response, NextFunction } from "express";
import { resumeService } from "../services/resume.service.js";
import type { JwtPayload } from "../middleware/auth.js";

function userFromRequest(req: Request): string {
  return (req.user as JwtPayload).id;
}

export class ResumeController {
  uploadResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) { res.status(400).json({ success: false, error: { message: "No file uploaded" } }); return; }
      const userId = userFromRequest(req);
      const fileUrl = `uploads/${userId}/${Date.now()}-${req.file.originalname}`;
      const resume = await resumeService.processResume(userId, fileUrl, req.file.buffer, req.file.mimetype);
      res.status(201).json({ success: true, data: resume });
    } catch (error) { next(error); }
  };

  getResumes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resumes = await resumeService.getUserResumes(userFromRequest(req));
      res.json({ success: true, data: resumes });
    } catch (error) { next(error); }
  };

  getResumeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resume = await resumeService.getResumeById(req.params.id, userFromRequest(req));
      if (!resume) { res.status(404).json({ success: false, error: { message: "Resume not found" } }); return; }
      res.json({ success: true, data: resume });
    } catch (error) { next(error); }
  };

  deleteResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await resumeService.deleteResume(req.params.id, userFromRequest(req));
      if (!deleted) { res.status(404).json({ success: false, error: { message: "Resume not found" } }); return; }
      res.json({ success: true, data: { message: "Resume deleted successfully" } });
    } catch (error) { next(error); }
  };

  reanalyzeResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resume = await resumeService.reanalyzeResume(req.params.id, userFromRequest(req));
      if (!resume) { res.status(404).json({ success: false, error: { message: "Resume not found or has no parsed text" } }); return; }
      res.json({ success: true, data: resume });
    } catch (error) { next(error); }
  };
}
