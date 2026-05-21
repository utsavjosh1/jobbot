import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { paymentService } from "../services/payment.service";
import { useAuthStore } from "../stores/auth.store";
import "../styles/transmission.css";

/**
 * TransmissionPricing
 * ───────────────────
 * Brutalist pricing cards. Hard borders, monospace, role-color accents.
 */

const PLANS = [
  {
    id: "pdt_starter",
    name: "STARTER",
    price: "$9",
    period: "/MO",
    description: "For individuals starting their search.",
    features: [
      "Up to 5 resume versions",
      "Basic AI chat support",
      "Weekly job alerts",
      "Discord community access",
    ],
    accent: "var(--tx-ink-muted)",
    pro: false,
  },
  {
    id: "pdt_pro",
    name: "PRO",
    price: "$29",
    period: "/MO",
    description: "The complete toolkit for serious seekers.",
    features: [
      "Unlimited resume versions",
      "Advanced AI career coaching",
      "Daily real-time job alerts",
      "Priority Discord support",
      "Custom cover letter generator",
    ],
    accent: "var(--tx-seeker)",
    pro: true,
  },
  {
    id: "pdt_enterprise",
    name: "TEAM",
    price: "$99",
    period: "/MO",
    description: "For recruiting teams and agencies.",
    features: [
      "Everything in Pro",
      "Team collaboration tools",
      "Bulk resume processing",
      "API access",
      "Dedicated account manager",
    ],
    accent: "var(--tx-recruiter)",
    pro: false,
  },
];

export function TransmissionPricing() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (productId: string) => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/pricing");
      return;
    }
    setLoadingPlan(productId);
    try {
      const { checkout_url } =
        await paymentService.createCheckoutSession(productId);
      window.location.assign(checkout_url);
    } catch (error) {
      console.error("Failed to initiate checkout:", error);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--tx-bg)",
        fontFamily: "var(--tx-font-mono)",
        padding: "60px 20px 80px",
      }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <Link
            to="/"
            style={{
              fontFamily: "var(--tx-font-display)",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "6px",
              color: "var(--tx-ink)",
              textDecoration: "none",
              textTransform: "uppercase",
            }}
          >
            POSTLY
          </Link>
          <h1
            style={{
              fontFamily: "var(--tx-font-display)",
              fontSize: "clamp(36px, 6vw, 56px)",
              fontWeight: 800,
              color: "var(--tx-ink)",
              margin: "20px 0 8px",
              lineHeight: 1,
              letterSpacing: "-1px",
            }}
          >
            PRICING
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--tx-ink-muted)",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            Scale your signal. 14-day money-back guarantee.
          </p>
        </div>

        {/* Cards grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
          }}
        >
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: "var(--tx-surface)",
                border: `2px solid ${plan.pro ? plan.accent : "var(--tx-border)"}`,
                borderRadius: "var(--tx-radius)",
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {/* Popular badge */}
              {plan.pro && (
                <div
                  style={{
                    position: "absolute",
                    top: "-1px",
                    right: "16px",
                    padding: "4px 12px",
                    fontSize: "9px",
                    fontWeight: 700,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--tx-surface)",
                    background: plan.accent,
                  }}
                >
                  POPULAR
                </div>
              )}

              {/* Plan name */}
              <h3
                style={{
                  fontFamily: "var(--tx-font-display)",
                  fontSize: "16px",
                  fontWeight: 800,
                  letterSpacing: "3px",
                  color: "var(--tx-ink)",
                  marginBottom: "8px",
                }}
              >
                {plan.name}
              </h3>

              <p
                style={{
                  fontSize: "11px",
                  color: "var(--tx-ink-muted)",
                  marginBottom: "20px",
                  lineHeight: 1.5,
                }}
              >
                {plan.description}
              </p>

              {/* Price */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "4px",
                  marginBottom: "24px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--tx-font-display)",
                    fontSize: "42px",
                    fontWeight: 900,
                    color: "var(--tx-ink)",
                    lineHeight: 1,
                  }}
                >
                  {plan.price}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--tx-ink-muted)",
                    fontWeight: 600,
                    letterSpacing: "1px",
                  }}
                >
                  {plan.period}
                </span>
              </div>

              {/* Features */}
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 28px",
                  flex: 1,
                }}
              >
                {plan.features.map((feat, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "12px",
                      color: "var(--tx-ink)",
                      padding: "6px 0",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        background: plan.accent,
                        flexShrink: 0,
                      }}
                    />
                    {feat}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loadingPlan === plan.id}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontFamily: "var(--tx-font-mono)",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: plan.pro ? "var(--tx-surface)" : "var(--tx-ink)",
                  background: plan.pro ? plan.accent : "transparent",
                  border: `2px solid ${plan.pro ? plan.accent : "var(--tx-border)"}`,
                  borderRadius: "var(--tx-radius)",
                  cursor: loadingPlan === plan.id ? "not-allowed" : "pointer",
                  opacity: loadingPlan === plan.id ? 0.6 : 1,
                  transition: "all 150ms var(--tx-ease-sharp)",
                }}
                onMouseEnter={(e) => {
                  if (!plan.pro) {
                    e.currentTarget.style.backgroundColor = "var(--tx-ink)";
                    e.currentTarget.style.color = "var(--tx-surface)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!plan.pro) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--tx-ink)";
                  }
                }}
              >
                {loadingPlan === plan.id
                  ? "···"
                  : plan.pro
                    ? "GO PRO →"
                    : "SELECT →"}
              </button>
            </div>
          ))}
        </div>

        {/* Manage subscription */}
        <div
          style={{
            textAlign: "center",
            marginTop: "40px",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              color: "var(--tx-ink-muted)",
              marginBottom: "12px",
              letterSpacing: "1px",
            }}
          >
            ALREADY SUBSCRIBED?
          </p>
          <button
            onClick={async () => {
              const customerId = user?.email || "";
              try {
                const { portal_url } =
                  await paymentService.getCustomerPortal(customerId);
                window.location.assign(portal_url);
              } catch (error) {
                console.error("Portal error:", error);
              }
            }}
            style={{
              padding: "10px 20px",
              fontFamily: "var(--tx-font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--tx-ink)",
              background: "transparent",
              border: "2px solid var(--tx-border)",
              borderRadius: "var(--tx-radius)",
              cursor: "pointer",
              transition:
                "background-color 150ms var(--tx-ease-sharp), color 150ms var(--tx-ease-sharp)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--tx-ink)";
              e.currentTarget.style.color = "var(--tx-surface)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--tx-ink)";
            }}
          >
            MANAGE SUBSCRIPTION
          </button>
        </div>
      </div>
    </div>
  );
}
