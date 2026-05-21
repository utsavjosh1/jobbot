import { Router, Request, Response, NextFunction } from "express";
import {
  checkoutHandler,
  Webhooks,
  CustomerPortal,
} from "@dodopayments/express";
import {
  DODO_PAYMENTS_API_KEY,
  DODO_PAYMENTS_WEBHOOK_KEY,
  DODO_PAYMENTS_ENVIRONMENT,
  DODO_PAYMENTS_RETURN_URL,
} from "../config/secrets.js";
import { db, subscriptions, payments, eq } from "@postly/database";

const router = Router();

function requireEnv(
  key: string,
  value: string | undefined,
): (req: Request, res: Response, next: NextFunction) => void {
  return (_req, res, next) => {
    if (!value) {
      res.status(503).json({
        success: false,
        error: { message: `Service unavailable: ${key} is not configured.` },
      });
      return;
    }
    next();
  };
}

let _webhookHandler: ReturnType<typeof Webhooks> | null = null;

function getWebhookHandler() {
  if (!_webhookHandler) {
    _webhookHandler = Webhooks({
      webhookKey: DODO_PAYMENTS_WEBHOOK_KEY!,
      onPayload: async (payload) => {
        const data = payload.data as Record<string, unknown>;
        const customerId = data?.customer_id as string | undefined;
        const subscriptionId = data?.subscription_id as string | undefined;

        let userId: string | null = null;
        if (customerId) {
          const [sub] = await db
            .select({ user_id: subscriptions.user_id })
            .from(subscriptions)
            .where(eq(subscriptions.dodo_customer_id, customerId));
          userId = sub?.user_id ?? null;
        }

        const now = new Date();

        switch (payload.type) {
          case "subscription.active":
          case "subscription.renewed":
            if (!userId) break;
            await db
              .update(subscriptions)
              .set({
                status: "active",
                dodo_subscription_id: subscriptionId,
                current_period_start: data?.current_period_start
                  ? new Date(data.current_period_start as string)
                  : undefined,
                current_period_end: data?.current_period_end
                  ? new Date(data.current_period_end as string)
                  : undefined,
                raw_data: data,
                updated_at: now,
              })
              .where(eq(subscriptions.user_id, userId));
            break;
          case "subscription.cancelled":
            if (!userId) break;
            await db
              .update(subscriptions)
              .set({
                status: "cancelled",
                cancelled_at: now,
                raw_data: data,
                updated_at: now,
              })
              .where(eq(subscriptions.user_id, userId));
            break;
          case "subscription.expired":
            if (!userId) break;
            await db
              .update(subscriptions)
              .set({ status: "expired", raw_data: data, updated_at: now })
              .where(eq(subscriptions.user_id, userId));
            break;
          case "payment.succeeded":
          case "payment.failed":
          case "refund.succeeded":
            if (!userId) break;
            const status =
              payload.type === "payment.succeeded"
                ? "succeeded"
                : payload.type === "refund.succeeded"
                  ? "refunded"
                  : "failed";
            await db.insert(payments).values({
              user_id: userId,
              dodo_payment_id: data?.payment_id as string | undefined,
              dodo_customer_id: customerId,
              event_type: payload.type,
              status,
              amount: Number(data?.amount ?? 0),
              currency: (data?.currency as string | undefined) ?? "USD",
              paid_at:
                status === "succeeded" || status === "refunded"
                  ? now
                  : undefined,
              raw_payload: data,
              idempotency_key: `${payload.type}_${payload.timestamp}_${data?.payment_id || data?.subscription_id || Date.now()}`,
            });
            break;
        }
      },
    });
  }
  return _webhookHandler;
}

const checkout = (type: "static" | "dynamic" | "session") =>
  checkoutHandler({
    bearerToken: DODO_PAYMENTS_API_KEY!,
    returnUrl: DODO_PAYMENTS_RETURN_URL!,
    environment: DODO_PAYMENTS_ENVIRONMENT,
    type,
  });

router.get(
  "/checkout",
  requireEnv("DODO_PAYMENTS_API_KEY", DODO_PAYMENTS_API_KEY),
  (req, res) => checkout("static")(req, res),
);
router.post(
  "/checkout/dynamic",
  requireEnv("DODO_PAYMENTS_API_KEY", DODO_PAYMENTS_API_KEY),
  (req, res) => checkout("dynamic")(req, res),
);
router.post(
  "/checkout/session",
  requireEnv("DODO_PAYMENTS_API_KEY", DODO_PAYMENTS_API_KEY),
  (req, res) => checkout("session")(req, res),
);
router.get(
  "/customer-portal",
  requireEnv("DODO_PAYMENTS_API_KEY", DODO_PAYMENTS_API_KEY),
  (req, res) =>
    CustomerPortal({
      bearerToken: DODO_PAYMENTS_API_KEY!,
      environment: DODO_PAYMENTS_ENVIRONMENT,
    })(req, res),
);
router.post(
  "/webhook",
  requireEnv("DODO_PAYMENTS_WEBHOOK_KEY", DODO_PAYMENTS_WEBHOOK_KEY),
  (req, res) => getWebhookHandler()(req, res),
);

export default router;
