import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { discordService, DiscordConfig } from "../services/discord.service";
import { useToastStore } from "../stores/toast.store";
import "../styles/transmission.css";

/**
 * TransmissionIntegrations
 * ────────────────────────
 * Brutalist integrations hub. Discord is fully working.
 * Twitter and Reddit are shown as "coming soon".
 */

/* ─── Integration card data ─────────────────────────────────────────── */
interface Integration {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  status: "active" | "coming_soon";
}

const INTEGRATIONS: Integration[] = [
  {
    id: "discord",
    name: "DISCORD",
    icon: "⚡",
    description:
      "Get real-time job alerts delivered directly to your Discord server.",
    color: "#5865F2",
    status: "active",
  },
  {
    id: "twitter",
    name: "TWITTER / X",
    icon: "𝕏",
    description:
      "Auto-post new job matches and career updates to your timeline.",
    color: "var(--tx-ink)",
    status: "coming_soon",
  },
  {
    id: "reddit",
    name: "REDDIT",
    icon: "◉",
    description:
      "Share curated job listings to relevant subreddits automatically.",
    color: "#FF4500",
    status: "coming_soon",
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function TransmissionIntegrations() {
  const { addToast } = useToastStore();

  // Discord state
  const [configs, setConfigs] = useState<DiscordConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newChannelId, setNewChannelId] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await discordService.getConfigs();
      setConfigs(data || []);
    } catch (err) {
      console.error("Failed to load discord configs:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle discord OAuth magic link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const guildId = params.get("guild_id");
    if (guildId) {
      setActiveSection("discord");
      setIsLoading(true);
      discordService
        .linkServer(guildId)
        .then(() => {
          addToast({ type: "success", message: "Discord server linked!" });
          window.history.replaceState({}, "", window.location.pathname);
          loadConfigs();
        })
        .catch(() => {
          addToast({ type: "error", message: "Failed to link server" });
          loadConfigs();
        });
    }
  }, [addToast, loadConfigs]);

  const handleUpdateChannel = async (id: string) => {
    if (!newChannelId) return;
    try {
      await discordService.updateConfig(id, { channel_id: newChannelId });
      addToast({ type: "success", message: "Channel updated" });
      setEditingId(null);
      loadConfigs();
    } catch {
      addToast({ type: "error", message: "Update failed" });
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    try {
      const res = await discordService.triggerTestNotification();
      if (res.success) {
        addToast({ type: "success", message: "Test notification sent!" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Test failed";
      addToast({ type: "error", message: msg });
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleSection = (id: string) => {
    if (activeSection === id) {
      setActiveSection(null);
    } else {
      setActiveSection(id);
      if (id === "discord") loadConfigs();
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
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "48px" }}>
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
            ← POSTLY
          </Link>
          <h1
            style={{
              fontFamily: "var(--tx-font-display)",
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 800,
              color: "var(--tx-ink)",
              margin: "20px 0 8px",
              lineHeight: 1,
              letterSpacing: "-1px",
            }}
          >
            INTEGRATIONS
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--tx-ink-muted)",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            Connect your channels. Amplify the signal.
          </p>
        </div>

        {/* Integration cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {INTEGRATIONS.map((intg) => (
            <div key={intg.id}>
              {/* Card header */}
              <button
                onClick={() =>
                  intg.status === "active" && handleToggleSection(intg.id)
                }
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "20px 24px",
                  background: "var(--tx-surface)",
                  border: `2px solid ${activeSection === intg.id ? intg.color : "var(--tx-border)"}`,
                  borderRadius: "var(--tx-radius)",
                  cursor: intg.status === "active" ? "pointer" : "default",
                  fontFamily: "var(--tx-font-mono)",
                  textAlign: "left",
                  transition: "border-color 150ms var(--tx-ease-sharp)",
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      intg.status === "active" ? intg.color : "var(--tx-bg)",
                    border: "2px solid var(--tx-border)",
                    fontSize: "20px",
                    flexShrink: 0,
                    color:
                      intg.status === "active"
                        ? "white"
                        : "var(--tx-ink-muted)",
                  }}
                >
                  {intg.icon}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        letterSpacing: "2px",
                        color: "var(--tx-ink)",
                      }}
                    >
                      {intg.name}
                    </span>
                    {intg.status === "coming_soon" && (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          letterSpacing: "2px",
                          padding: "2px 8px",
                          border: "1px solid var(--tx-ink-muted)",
                          color: "var(--tx-ink-muted)",
                        }}
                      >
                        SOON
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--tx-ink-muted)",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {intg.description}
                  </p>
                </div>

                {/* Arrow / status */}
                <span
                  style={{
                    fontSize: "16px",
                    color: "var(--tx-ink-muted)",
                    flexShrink: 0,
                    transition: "transform 150ms var(--tx-ease-sharp)",
                    transform:
                      activeSection === intg.id
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                  }}
                >
                  {intg.status === "active" ? "→" : "·"}
                </span>
              </button>

              {/* Discord expanded section */}
              {intg.id === "discord" && activeSection === "discord" && (
                <div
                  style={{
                    background: "var(--tx-surface)",
                    borderLeft: `2px solid ${intg.color}`,
                    borderRight: "2px solid var(--tx-border)",
                    borderBottom: "2px solid var(--tx-border)",
                    padding: "24px",
                    marginTop: "-2px",
                  }}
                >
                  {/* Add bot button */}
                  <button
                    onClick={() => {
                      window.location.assign(discordService.getAuthorizeUrl());
                    }}
                    style={{
                      padding: "10px 20px",
                      fontFamily: "var(--tx-font-mono)",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                      color: "white",
                      background: intg.color,
                      border: `2px solid ${intg.color}`,
                      borderRadius: "var(--tx-radius)",
                      cursor: "pointer",
                      marginBottom: "20px",
                      transition: "opacity 150ms var(--tx-ease-sharp)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.85";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    + CONNECT SERVER
                  </button>

                  {/* Configs */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "2px",
                        color: "var(--tx-ink-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      ACTIVE CHANNELS
                    </span>
                    <button
                      onClick={loadConfigs}
                      disabled={isLoading}
                      style={{
                        background: "none",
                        border: "none",
                        fontFamily: "var(--tx-font-mono)",
                        fontSize: "10px",
                        color: "var(--tx-ink-muted)",
                        cursor: "pointer",
                        letterSpacing: "1px",
                      }}
                    >
                      {isLoading ? "···" : "↻ REFRESH"}
                    </button>
                  </div>

                  {configs.length === 0 ? (
                    <div
                      style={{
                        padding: "20px",
                        textAlign: "center",
                        border: "1px dashed var(--tx-border)",
                        fontSize: "11px",
                        color: "var(--tx-ink-muted)",
                      }}
                    >
                      No servers connected yet.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {configs.map((config) => (
                        <div
                          key={config.id}
                          style={{
                            padding: "14px 16px",
                            border: "2px solid var(--tx-border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: "150px" }}>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "var(--tx-ink)",
                              }}
                            >
                              {config.guild_name || "Unknown Server"}
                            </div>
                            {editingId === config.id ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: "6px",
                                  marginTop: "6px",
                                }}
                              >
                                <input
                                  value={newChannelId}
                                  onChange={(e) =>
                                    setNewChannelId(e.target.value)
                                  }
                                  placeholder="Channel ID"
                                  style={{
                                    padding: "6px 10px",
                                    background: "var(--tx-bg)",
                                    border: "1px solid var(--tx-border)",
                                    fontFamily: "var(--tx-font-mono)",
                                    fontSize: "11px",
                                    color: "var(--tx-ink)",
                                    outline: "none",
                                    flex: 1,
                                  }}
                                />
                                <button
                                  onClick={() => handleUpdateChannel(config.id)}
                                  style={{
                                    padding: "6px 10px",
                                    fontFamily: "var(--tx-font-mono)",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    background: "var(--tx-ink)",
                                    color: "var(--tx-surface)",
                                    border: "none",
                                    cursor: "pointer",
                                    letterSpacing: "1px",
                                  }}
                                >
                                  SAVE
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingId(config.id);
                                  setNewChannelId(config.channel_id || "");
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  fontSize: "10px",
                                  color: "var(--tx-ink-muted)",
                                  cursor: "pointer",
                                  padding: 0,
                                  marginTop: "2px",
                                  fontFamily: "var(--tx-font-mono)",
                                }}
                              >
                                #{config.channel_name || "configure channel"}
                              </button>
                            )}
                          </div>

                          {/* Test button */}
                          <button
                            onClick={handleTestNotification}
                            disabled={isTesting || !config.is_active}
                            style={{
                              padding: "6px 12px",
                              fontFamily: "var(--tx-font-mono)",
                              fontSize: "10px",
                              fontWeight: 700,
                              letterSpacing: "1px",
                              textTransform: "uppercase",
                              color: "var(--tx-ink)",
                              background: "transparent",
                              border: "1px solid var(--tx-border)",
                              cursor:
                                isTesting || !config.is_active
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: isTesting || !config.is_active ? 0.4 : 1,
                            }}
                          >
                            {isTesting ? "···" : "TEST ↗"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bot command reference */}
                  <div
                    style={{
                      marginTop: "20px",
                      padding: "12px 16px",
                      background: "var(--tx-bg)",
                      border: "1px solid var(--tx-border)",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "2px",
                        color: "var(--tx-ink-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      BOT COMMAND
                    </span>
                    <div
                      style={{
                        fontFamily: "var(--tx-font-mono)",
                        fontSize: "13px",
                        color: "var(--tx-ink)",
                        marginTop: "4px",
                      }}
                    >
                      /setup [channel]
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
