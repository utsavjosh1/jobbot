import { eq, desc } from "drizzle-orm";
import { db } from "../index.js";
import { payments, subscriptions } from "../schema.js";
import type { CreatePaymentInput } from "@postly/shared-types";

export const paymentQueries = {
  // Called once per DodoPayments webhook event. Never update — append only.
  async recordFromWebhook(
    userId: string,
    input: CreatePaymentInput,
    subscriptionId?: string,
  ) {
    // Resolve subscriptionId from dodo_customer_id if not provided directly.
    let resolvedSubId = subscriptionId;
    if (!resolvedSubId && input.dodo_customer_id) {
      const [sub] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.dodo_customer_id, input.dodo_customer_id));
      resolvedSubId = sub?.id;
    }

    const [result] = await db
      .insert(payments)
      .values({
        user_id: userId,
        subscription_id: resolvedSubId,
        ...input,
        currency: input.currency ?? "USD",
        idempotency_key: input.idempotency_key,
      })
      .returning();

    return result;
  },

  async findByUserId(userId: string, limit = 50) {
    return db
      .select()
      .from(payments)
      .where(eq(payments.user_id, userId))
      .orderBy(desc(payments.created_at))
      .limit(limit);
  },

  async findByDodoPaymentId(dodoPaymentId: string) {
    const [result] = await db
      .select()
      .from(payments)
      .where(eq(payments.dodo_payment_id, dodoPaymentId));

    return result ?? null;
  },
};
