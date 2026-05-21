import { Request, Response, NextFunction } from "express";
import { jobQueries } from "@postly/database";
import { matchingService } from "../services/matching.service.js";
import type { JobType } from "@postly/shared-types";
import type { JwtPayload } from "../middleware/auth.js";

function userFromRequest(req: Request): string {
  return (req.user as JwtPayload).id;
}

export class JobController {
  getJobs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        location,
        job_type,
        remote,
        limit = "50",
        offset = "0",
      } = req.query;
      const filters = {
        location: location as string | undefined,
        job_type: job_type as JobType | undefined,
        remote:
          remote === "true" ? true : remote === "false" ? false : undefined,
      };
      const [jobs, total] = await Promise.all([
        jobQueries.findActive(
          filters,
          parseInt(limit as string),
          parseInt(offset as string),
        ),
        jobQueries.countActive(),
      ]);
      res.json({
        success: true,
        data: {
          jobs,
          total,
          page:
            Math.floor(parseInt(offset as string) / parseInt(limit as string)) +
            1,
          limit: parseInt(limit as string),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getJobById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const job = await jobQueries.findById(req.params.id as string);
      if (!job) {
        res
          .status(404)
          .json({ success: false, error: { message: "Job not found" } });
        return;
      }
      res.json({ success: true, data: job });
    } catch (error) {
      next(error);
    }
  };

  getMatches = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { resumeId } = req.params;
      const { limit = "20", with_explanations = "false" } = req.query;
      const userId = userFromRequest(req);
      const matches =
        with_explanations === "true"
          ? await matchingService.getMatchesWithExplanations(
              resumeId as string,
              userId,
              parseInt(limit as string),
            )
          : await matchingService.findMatchingJobs(
              resumeId as string,
              userId,
              parseInt(limit as string),
            );
      res.json({ success: true, data: matches });
    } catch (error) {
      next(error);
    }
  };

  saveMatch = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { resume_id, match_score = 0, explanation } = req.body;
      if (!resume_id) {
        res
          .status(400)
          .json({
            success: false,
            error: { message: "resume_id is required" },
          });
        return;
      }
      const match = await matchingService.saveMatch(
        userFromRequest(req),
        resume_id,
        req.params.jobId as string,
        match_score,
        explanation,
      );
      res.json({ success: true, data: match });
    } catch (error) {
      next(error);
    }
  };

  unsaveMatch = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await matchingService.unsaveMatch(userFromRequest(req), req.params.jobId as string);
      res.json({ success: true, data: { message: "Job unsaved" } });
    } catch (error) {
      next(error);
    }
  };

  getSavedMatches = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const saved = await matchingService.getSavedMatches(userFromRequest(req));
      res.json({ success: true, data: saved });
    } catch (error) {
      next(error);
    }
  };

  markAsApplied = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await matchingService.markAsApplied(
        userFromRequest(req),
        req.params.jobId as string,
      );
      res.json({ success: true, data: { message: "Marked as applied" } });
    } catch (error) {
      next(error);
    }
  };
}
