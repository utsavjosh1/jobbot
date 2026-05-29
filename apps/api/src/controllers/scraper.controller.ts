import { Request, Response, NextFunction } from "express";
import { scraperQueries } from "@postly/database";

export class ScraperController {
  /**
   * GET /api/v1/scraper/stats
   * Returns dataset statistics: total jobs, by source, recent runs.
   */
  getStats = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const [totalJobs, bySource, recentRuns] = await Promise.all([
        scraperQueries.countUniqueJobs(),
        scraperQueries.countBySource(),
        scraperQueries.getRecentRuns(20),
      ]);

      res.json({
        success: true,
        data: {
          total_jobs: totalJobs,
          by_source: bySource,
          recent_runs: recentRuns,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/scraper/runs
   * Returns paginated scraper run history.
   */
  getRuns = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const runs = await scraperQueries.getRecentRuns(limit);
      res.json({ success: true, data: runs });
    } catch (error) {
      next(error);
    }
  };
}
