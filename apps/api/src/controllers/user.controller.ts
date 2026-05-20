import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { userQueries, seekerProfileQueries, employerProfileQueries, subscriptionQueries } from "@postly/database";
import type { JwtPayload } from "../middleware/auth.js";
import { CacheService } from "../services/cache.service.js";

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().or(z.string().length(0)).optional(),
  timezone: z.string().max(50).optional(),
  locale: z.string().max(20).optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

const updateSeekerProfileSchema = z.object({
  headline: z.string().max(500).optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  experience_years: z.number().int().optional(),
  experience_level: z.enum(["entry", "mid", "senior", "lead", "executive"]).optional(),
  desired_job_titles: z.array(z.string()).optional(),
  desired_locations: z.array(z.string()).optional(),
  desired_salary_min: z.string().optional(),
  desired_salary_max: z.string().optional(),
  desired_job_type: z.enum(["full_time", "part_time", "contract", "freelance", "internship"]).optional(),
  open_to_remote: z.boolean().optional(),
  open_to_relocation: z.boolean().optional(),
});

const updateEmployerProfileSchema = z.object({
  company_name: z.string().min(1).max(255).optional(),
  company_website: z.string().url().optional(),
  company_logo_url: z.string().url().optional(),
  company_description: z.string().optional(),
  company_size: z.string().optional(),
  industry: z.string().max(150).optional(),
  headquarters_location: z.string().max(255).optional(),
  social_links: z.record(z.string()).optional(),
});

function userFromRequest(req: Request): string {
  return (req.user as JwtPayload).id;
}

export class UserController {
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = userFromRequest(req);
      const user = await CacheService.getOrSet(CacheService.generateKey("user:profile", userId), 300, () => userQueries.findById(userId));
      if (!user) { res.status(404).json({ success: false, error: { message: "User not found" } }); return; }
      res.json({ success: true, data: { id: user.id, email: user.email, full_name: user.full_name, roles: user.roles, is_verified: user.is_verified, last_login_at: user.last_login_at, created_at: user.created_at, updated_at: user.updated_at } });
    } catch (error) { next(error); }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) { res.status(400).json({ success: false, error: { message: validation.error.errors[0].message } }); return; }
      const userId = userFromRequest(req);
      const updated = await userQueries.update(userId, validation.data);
      if (!updated) { res.status(404).json({ success: false, error: { message: "User not found" } }); return; }
      await CacheService.invalidate(CacheService.generateKey("user:profile", userId));
      res.json({ success: true, data: updated });
    } catch (error) { next(error); }
  };

  getSeekerProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await seekerProfileQueries.findByUserId(userFromRequest(req));
      res.json({ success: true, data: profile });
    } catch (error) { next(error); }
  };

  updateSeekerProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = updateSeekerProfileSchema.safeParse(req.body);
      if (!validation.success) { res.status(400).json({ success: false, error: { message: validation.error.errors[0].message } }); return; }
      const updated = await seekerProfileQueries.update(userFromRequest(req), validation.data);
      res.json({ success: true, data: updated });
    } catch (error) { next(error); }
  };

  getEmployerProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await employerProfileQueries.findByUserId(userFromRequest(req));
      res.json({ success: true, data: profile });
    } catch (error) { next(error); }
  };

  updateEmployerProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = updateEmployerProfileSchema.safeParse(req.body);
      if (!validation.success) { res.status(400).json({ success: false, error: { message: validation.error.errors[0].message } }); return; }
      const userId = userFromRequest(req);
      const profile = await employerProfileQueries.findByUserId(userId);
      const result = profile
        ? await employerProfileQueries.update(userId, validation.data)
        : await employerProfileQueries.create(userId, { company_name: validation.data.company_name ?? "", ...validation.data });
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  };

  getSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subscription = await subscriptionQueries.findByUserId(userFromRequest(req));
      res.json({ success: true, data: subscription ?? { plan: "free", status: "active" } });
    } catch (error) { next(error); }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = changePasswordSchema.safeParse(req.body);
      if (!validation.success) { res.status(400).json({ success: false, error: { message: validation.error.errors[0].message } }); return; }
      const userId = userFromRequest(req);
      const { current_password, new_password } = validation.data;

      const user = await userQueries.findByEmail((req.user as JwtPayload).email);
      if (!user || !user.password_hash) { res.status(404).json({ success: false, error: { message: "User not found" } }); return; }

      const isValid = await bcrypt.compare(current_password, user.password_hash);
      if (!isValid) { res.status(401).json({ success: false, error: { message: "Invalid current password" } }); return; }

      const salt = await bcrypt.genSalt(12);
      await userQueries.updatePassword(userId, await bcrypt.hash(new_password, salt));

      res.json({ success: true, data: { message: "Password updated successfully" } });
    } catch (error) { next(error); }
  };

  uploadAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) { res.status(400).json({ success: false, error: { message: "No file uploaded" } }); return; }
      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/avatars/${req.file.filename}`;
      res.json({ success: true, data: { url: fileUrl } });
    } catch (error) { next(error); }
  };
}
