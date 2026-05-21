import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { subscriptions } from "../schema.js";
import type {
  SubscriptionPlan,
  SubscriptionStatus,
  DodoSubscriptionPayload,
} from "@postly/shared-types";

export const subscriptionQueries = {
  async findByUserId(userId: string) {
    const [result] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.user_id, userId));

    return result ?? null;
  },

  async findByDodoSubscriptionId(dodoSubscriptionId: string) {
    const [result] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.dodo_subscription_id, dodoSubscriptionId));

    return result ?? null;
  },

  // Called by the DodoPayments webhook handler to create or update the subscription record.
  async upsertFromWebhook(userId: string, payload: DodoSubscriptionPayload) {
    const data = {
      user_id: userId,
      dodo_subscription_id: payload.dodo_subscription_id,
      dodo_customer_id: payload.dodo_customer_id,
      plan: (payload.plan as SubscriptionPlan) || "seeker",
      status: payload.status || "active",
      current_period_end: payload.current_period_end,
      updated_at: new Date(),
    };

    const [result] = await db
      .insert(subscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: [subscriptions.user_id],
        set: data,
      })
      .returning();

    return result;
  },

  async updateStatus(
    userId: string,
    status: SubscriptionStatus,
    currentPeriodEnd?: Date,
  ) {
    const [result] = await db
      .update(subscriptions)
      .set({
        status,
        ...(currentPeriodEnd && { current_period_end: currentPeriodEnd }),
        updated_at: new Date(),
      })
      .where(eq(subscriptions.user_id, userId))
      .returning();

    return result ?? null;
  },

  async getPlan(
    userId: string,
  ): Promise<{ plan: SubscriptionPlan; status: SubscriptionStatus } | null> {
    const [result] = await db
      .select({ plan: subscriptions.plan, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.user_id, userId));

    return result ?? null;
  },

  // Feature gate check — true if subscription is active and not expired.
  async isActive(userId: string): Promise<boolean> {
    const sub = await this.findByUserId(userId);
    if (!sub) return false;
    if (sub.status !== "active" && sub.status !== "trialing") return false;
    if (sub.current_period_end && new Date(sub.current_period_end) < new Date())
      return false;
    return true;
  },
};
