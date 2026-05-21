import { eq, sql } from "drizzle-orm";
import { db } from "../index.js";
import {
  users,
  employer_profiles,
  seeker_profiles,
  otp_codes,
} from "../schema.js";
import type { User, CreateUserDbInput, UserRole } from "@postly/shared-types";

export const userQueries = {
  /**
   * Create a new user
   */
  async create(input: CreateUserDbInput): Promise<User> {
    const { email, password_hash, full_name, roles = ["job_seeker"] } = input;

    return db.transaction(async (tx) => {
      // Generate DiceBear avatar URL
      const seed = full_name || email.split("@")[0];
      const avatar_url = `https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(seed)}`;

      const [result] = await tx
        .insert(users)
        .values({ email, password_hash, full_name, roles, avatar_url })
        .returning();

      const user = result as unknown as User;

      // Initialize profiles based on initial roles
      if (roles.includes("employer")) {
        await tx
          .insert(employer_profiles)
          .values({
            user_id: user.id,
            company_name: user.full_name || "My Company",
          })
          .onConflictDoNothing();
      }

      if (roles.includes("job_seeker")) {
        await tx
          .insert(seeker_profiles)
          .values({
            user_id: user.id,
          })
          .onConflictDoNothing();
      }

      return user;
    });
  },

  /**
   * Find user by email (includes password_hash for auth)
   */
  async findByEmail(
    email: string,
  ): Promise<(User & { password_hash: string }) | null> {
    const [result] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    return (result as unknown as User & { password_hash: string }) || null;
  },

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const [result] = await db.select().from(users).where(eq(users.id, id));

    return (result as unknown as User) || null;
  },

  /**
   * Update user profile fields
   */
  async update(
    id: string,
    updates: Partial<
      Pick<User, "full_name" | "roles" | "timezone" | "locale" | "avatar_url">
    >,
  ): Promise<User | null> {
    if (Object.keys(updates).length === 0) {
      return this.findById(id);
    }

    const [result] = await db
      .update(users)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return (result as unknown as User) || null;
  },

  /**
   * Delete user
   */
  async delete(id: string): Promise<boolean> {
    const [result] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });

    return !!result;
  },

  // ─── Forgot-Password Flow ──────────────────────────────────────────────

  /**
   * Store a password-reset token and expiry for the user.
   */
  async setResetToken(
    email: string,
    token: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const [result] = await db
      .update(users)
      .set({
        password_reset_token: token,
        password_reset_expires_at: expiresAt,
        updated_at: new Date(),
      })
      .where(eq(users.email, email))
      .returning({ id: users.id });

    return !!result;
  },

  /**
   * Find a user by their password-reset token (returns null if expired).
   */
  async findByResetToken(token: string): Promise<User | null> {
    const [result] = await db
      .select()
      .from(users)
      .where(eq(users.password_reset_token, token));

    if (!result) return null;

    // Check expiry
    if (
      result.password_reset_expires_at &&
      new Date(result.password_reset_expires_at) < new Date()
    ) {
      return null;
    }

    return result as unknown as User;
  },

  /**
   * Reset password and clear the reset token.
   */
  async resetPassword(
    token: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    const user = await this.findByResetToken(token);
    if (!user) return false;

    const [result] = await db
      .update(users)
      .set({
        password_hash: newPasswordHash,
        password_reset_token: null,
        password_reset_expires_at: null,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning({ id: users.id });

    return !!result;
  },

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await db
      .update(users)
      .set({ last_login_at: new Date(), updated_at: new Date() })
      .where(eq(users.id, id));
  },
  /**
   * Fetch a user with all their role-specific profiles and configs.
   */
  async getDetailedProfile(id: string) {
    return db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        seeker_profile: true,
        employer_profile: true,
        bot_configs: true,
        subscription: true,
      },
    });
  },

  /**
   * Add a role to a user if they don't already have it.
   */
  async addRole(userId: string, role: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    const roles = user.roles as UserRole[];
    if (roles.includes(role as UserRole)) return true;

    const [result] = await db
      .update(users)
      .set({
        roles: [...roles, role as UserRole],
        updated_at: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    // Auto-create profiles if needed
    if (role === "employer") {
      await db
        .insert(employer_profiles)
        .values({
          user_id: userId,
          company_name: user.full_name || "My Company", // Default name
        })
        .onConflictDoNothing();
    } else if (role === "job_seeker") {
      await db
        .insert(seeker_profiles)
        .values({
          user_id: userId,
        })
        .onConflictDoNothing();
    }

    return !!result;
  },

  /**
   * Remove a role from a user.
   */
  async removeRole(userId: string, role: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    const roles = user.roles as UserRole[];
    if (!roles.includes(role as UserRole)) return true;

    const [result] = await db
      .update(users)
      .set({
        roles: roles.filter((r) => r !== (role as UserRole)),
        updated_at: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    return !!result;
  },
  /**
   * Update user password
   */
  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const [result] = await db
      .update(users)
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });

    return !!result;
  },
};

// ─── OTP Flow ──────────────────────────────────────────────────────────

export const otpQueries = {
  /**
   * Create or update an OTP for a user.
   */
  async upsertOtp(
    userId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await db
      .insert(otp_codes)
      .values({
        user_id: userId,
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
        last_attempt_at: null,
      })
      .onConflictDoUpdate({
        target: otp_codes.user_id,
        set: {
          code_hash: codeHash,
          expires_at: expiresAt,
          attempts: 0,
          last_attempt_at: null,
          created_at: new Date(),
        },
      });
  },

  /**
   * Find OTP for a user.
   */
  async findOtpByUserId(userId: string) {
    return db.query.otp_codes.findFirst({
      where: eq(otp_codes.user_id, userId),
    });
  },

  /**
   * Increment OTP attempt count.
   */
  async incrementOtpAttempts(otpId: string): Promise<void> {
    await db
      .update(otp_codes)
      .set({
        attempts: sql`${otp_codes.attempts} + 1`,
        last_attempt_at: new Date(),
      })
      .where(eq(otp_codes.id, otpId));
  },

  /**
   * Delete OTP after successful verification or expiry.
   */
  async deleteOtp(otpId: string): Promise<void> {
    await db.delete(otp_codes).where(eq(otp_codes.id, otpId));
  },

  /**
   * Mark user as verified.
   */
  async verifyUser(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ is_verified: true, updated_at: new Date() })
      .where(eq(users.id, userId));
  },
};
