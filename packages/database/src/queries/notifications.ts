import { eq, desc } from "drizzle-orm";
import { db } from "../index.js";
import { notifications } from "../schema.js";
import type { NotificationStatus } from "@postly/shared-types";

export interface CreateNotificationInput {
  user_id: string;
  type?: string;
  subject: string;
  content: string;
  to_email: string;
  status?: NotificationStatus;
}

export const notificationQueries = {
  /**
   * Create a notification record (log)
   */
  async create(input: CreateNotificationInput) {
    const [result] = await db
      .insert(notifications)
      .values({ ...input, status: input.status || "pending" })
      .returning();

    return result;
  },

  /**
   * Worker queue: fetch all pending notifications.
   */
  async findPending(limit = 100) {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.status, "pending"))
      .orderBy(notifications.created_at)
      .limit(limit);
  },

  /**
   * Update notification status after sending.
   */
  async updateStatus(
    id: string,
    status: NotificationStatus,
    errorMessage?: string,
  ) {
    await db
      .update(notifications)
      .set({
        status,
        ...(errorMessage && { error_message: errorMessage }),
        ...(status === "sent" && { sent_at: new Date() }),
      })
      .where(eq(notifications.id, id));
  },

  /**
   * Fetch notification history for a user.
   */
  async findByUser(userId: string, limit = 50) {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(limit);
  },
};
