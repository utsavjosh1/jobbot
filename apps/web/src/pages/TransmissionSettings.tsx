import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/auth.store";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "../services/user.service";
import { useToastStore } from "../stores/toast.store";
import "../styles/transmission.css";

/**
 * TransmissionSettings
 * ────────────────────
 * Brutalist settings page. Tabbed layout (General, Professional, Security).
 * Dynamically adapts to Seeker or Recruiter roles.
 */

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const LOCALES = [
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "French", value: "fr-FR" },
  { label: "German", value: "de-DE" },
  { label: "Japanese", value: "ja-JP" },
  { label: "Hindi", value: "hi-IN" },
];

export function TransmissionSettings() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "general" | "professional" | "security"
  >("general");
  const [isUploading, setIsUploading] = useState(false);

  const role = user?.roles?.[0] || "seeker";
  const accentColor =
    role === "seeker" ? "var(--tx-seeker)" : "var(--tx-recruiter)";

  // Form state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [formData, setFormData] = useState<Record<string, any>>({
    full_name: user?.full_name || "",
    avatar_url: user?.avatar_url || "",
    timezone: user?.timezone || "UTC",
    locale: user?.locale || "en-US",
  });

  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  // Fetch role-specific profile
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ["profile", role],
    queryFn: () =>
      role === "seeker"
        ? userService.getSeekerProfile()
        : userService.getEmployerProfile(),
    enabled: !!user,
  });

  // Sync form data once profile is loaded
  useEffect(() => {
    if (profileData) {
      setFormData((prev) => ({
        ...prev,
        ...profileData,
        skills: profileData.skills?.join(", ") || "",
        desired_job_titles: profileData.desired_job_titles?.join(", ") || "",
        desired_locations: profileData.desired_locations?.join(", ") || "",
      }));
    }
  }, [profileData]);

  // Mutations
  const updateBaseProfile = useMutation({
    mutationFn: (data: Parameters<typeof userService.updateProfile>[0]) =>
      userService.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      addToast({
        type: "success",
        message: "General broadcast identity updated.",
      });
    },
    onError: (error: Error) => {
      addToast({
        type: "error",
        message: error.message || "Failed to update profile.",
      });
    },
  });

  const updateRoleProfile = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      role === "seeker"
        ? userService.updateSeekerProfile(data)
        : userService.updateEmployerProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", role] });
      addToast({
        type: "success",
        message: "Professional broadcast profile updated.",
      });
    },
    onError: (error: Error) => {
      addToast({
        type: "error",
        message: error.message || "Failed to update profile.",
      });
    },
  });

  const changePassword = useMutation({
    mutationFn: (data: Parameters<typeof userService.changePassword>[0]) =>
      userService.changePassword(data),
    onSuccess: () => {
      addToast({
        type: "success",
        message: "Cipher sequence updated (Password changed).",
      });
      setPasswordData({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    },
    onError: (error: Error) => {
      addToast({
        type: "error",
        message: error.message || "Failed to change password.",
      });
    },
  });

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    updateBaseProfile.mutate({
      full_name: formData.full_name,
      avatar_url: formData.avatar_url,
      timezone: formData.timezone,
      locale: formData.locale,
    });
  };

  const handleSaveProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    const roleData = { ...formData };
    delete roleData.full_name;
    delete roleData.avatar_url;
    delete roleData.timezone;
    delete roleData.locale;
    delete roleData.email;

    if (role === "seeker") {
      roleData.skills =
        roleData.skills
          ?.split(",")
          .map((s: string) => s.trim())
          .filter(Boolean) || [];
      roleData.desired_job_titles =
        roleData.desired_job_titles
          ?.split(",")
          .map((s: string) => s.trim())
          .filter(Boolean) || [];
      roleData.desired_locations =
        roleData.desired_locations
          ?.split(",")
          .map((s: string) => s.trim())
          .filter(Boolean) || [];
      roleData.experience_years = parseInt(roleData.experience_years) || 0;
    }

    updateRoleProfile.mutate(roleData);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      addToast({ type: "error", message: "Passphrase mismatch." });
      return;
    }
    changePassword.mutate({
      current_password: passwordData.current_password,
      new_password: passwordData.new_password,
    });
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    const val =
      type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      addToast({
        type: "error",
        message: "File sequence too heavy (Max 2MB).",
      });
      return;
    }

    try {
      setIsUploading(true);
      const url = await userService.uploadAvatar(file);
      setFormData((prev) => ({ ...prev, avatar_url: url }));
      addToast({
        type: "success",
        message: "Cipher image uploaded to broadcast node.",
      });
    } catch (error: unknown) {
      addToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to upload image.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  if (isProfileLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--tx-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--tx-font-mono)",
            fontSize: "14px",
            letterSpacing: "2px",
          }}
        >
          LINKING TO BROADCAST NODE...
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--tx-bg)",
        fontFamily: "var(--tx-font-mono)",
        padding: "60px 20px 80px",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <Link
            to="/chat"
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
            ← RETURN TO COMMUNICATIONS
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
            SETTINGS
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--tx-ink-muted)",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            Node ID: {user?.id?.split("-")[0]}...
          </p>
        </div>

        {/* Main Layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            gap: "40px",
            alignItems: "start",
          }}
        >
          {/* Side Tabs */}
          <nav
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <TabButton
              active={activeTab === "general"}
              onClick={() => setActiveTab("general")}
              accent={accentColor}
              label="GENERAL"
            />
            <TabButton
              active={activeTab === "professional"}
              onClick={() => setActiveTab("professional")}
              accent={accentColor}
              label="PROFESSIONAL"
            />
            <TabButton
              active={activeTab === "security"}
              onClick={() => setActiveTab("security")}
              accent={accentColor}
              label="SECURITY"
            />
          </nav>

          {/* Content Pane */}
          <div
            style={{
              background: "var(--tx-surface)",
              border: "2px solid var(--tx-border)",
              borderRadius: "var(--tx-radius)",
              padding: "40px",
              boxShadow: "8px 8px 0px var(--tx-border)",
              minHeight: "500px",
            }}
          >
            {/* ─── GENERAL TAB ─── */}
            {activeTab === "general" && (
              <form
                onSubmit={handleSaveGeneral}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "32px",
                }}
              >
                <SectionHeader title="Base Identity" />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "24px",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "80px",
                      height: "80px",
                      border: "2px solid var(--tx-border)",
                      borderRadius: "var(--tx-radius)",
                      background: "var(--tx-bg)",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {formData.avatar_url ? (
                      <img
                        src={formData.avatar_url}
                        alt="Avatar"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: "24px", fontWeight: 800 }}>?</div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Avatar URL">
                      <div style={{ display: "flex", gap: "12px" }}>
                        <Input
                          name="avatar_url"
                          value={formData.avatar_url}
                          onChange={handleInputChange}
                          accent={accentColor}
                          placeholder="https://api.dicebear.com/..."
                        />
                        <button
                          type="button"
                          onClick={() =>
                            document.getElementById("avatar-upload")?.click()
                          }
                          disabled={isUploading}
                          style={{
                            padding: "0 16px",
                            fontFamily: "var(--tx-font-mono)",
                            fontSize: "10px",
                            fontWeight: 800,
                            background: "var(--tx-bg)",
                            border: "2px solid var(--tx-border)",
                            borderRadius: "var(--tx-radius)",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isUploading ? "UPLOADING..." : "UPLOAD IMAGE"}
                        </button>
                        <input
                          id="avatar-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          style={{ display: "none" }}
                        />
                      </div>
                    </Field>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "24px",
                  }}
                >
                  <Field label="Full Name">
                    <Input
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      accent={accentColor}
                    />
                  </Field>
                  <Field label="Email (Linked)">
                    <Input
                      name="email"
                      value={user?.email || ""}
                      disabled
                      accent={accentColor}
                    />
                  </Field>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "24px",
                  }}
                >
                  <Field label="Timezone">
                    <Select
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleInputChange}
                      accent={accentColor}
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Locale">
                    <Select
                      name="locale"
                      value={formData.locale}
                      onChange={handleInputChange}
                      accent={accentColor}
                    >
                      {LOCALES.map((loc) => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <SubmitButton
                  label="UPDATE GENERAL"
                  loading={updateBaseProfile.isPending}
                  accent={accentColor}
                />
              </form>
            )}

            {/* ─── PROFESSIONAL TAB ─── */}
            {activeTab === "professional" && (
              <form
                onSubmit={handleSaveProfessional}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "32px",
                }}
              >
                {role === "seeker" ? (
                  <>
                    <SectionHeader title="Broadcaster Profile" />
                    <Field label="Headline">
                      <Input
                        name="headline"
                        value={formData.headline}
                        onChange={handleInputChange}
                        accent={accentColor}
                        placeholder="Senior Signal Processor"
                      />
                    </Field>
                    <Field label="Summary">
                      <TextArea
                        name="summary"
                        value={formData.summary}
                        onChange={handleInputChange}
                        accent={accentColor}
                      />
                    </Field>
                    <Field label="Skills">
                      <Input
                        name="skills"
                        value={formData.skills}
                        onChange={handleInputChange}
                        accent={accentColor}
                        placeholder="React, Drizzle, Postgres..."
                      />
                    </Field>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "24px",
                      }}
                    >
                      <Field label="Experience (Years)">
                        <Input
                          name="experience_years"
                          type="number"
                          value={formData.experience_years}
                          onChange={handleInputChange}
                          accent={accentColor}
                        />
                      </Field>
                      <Field label="Level">
                        <Select
                          name="experience_level"
                          value={formData.experience_level}
                          onChange={handleInputChange}
                          accent={accentColor}
                        >
                          <option value="entry">Entry</option>
                          <option value="mid">Mid</option>
                          <option value="senior">Senior</option>
                          <option value="lead">Lead</option>
                          <option value="executive">Executive</option>
                        </Select>
                      </Field>
                    </div>
                    <SectionHeader title="Transmission Preferences" />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "24px",
                      }}
                    >
                      <Field label="Job Type">
                        <Select
                          name="desired_job_type"
                          value={formData.desired_job_type}
                          onChange={handleInputChange}
                          accent={accentColor}
                        >
                          <option value="full_time">Full Time</option>
                          <option value="part_time">Part Time</option>
                          <option value="contract">Contract</option>
                          <option value="freelance">Freelance</option>
                        </Select>
                      </Field>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          paddingTop: "28px",
                        }}
                      >
                        <input
                          type="checkbox"
                          name="open_to_remote"
                          checked={formData.open_to_remote}
                          onChange={handleInputChange}
                          id="remote-check"
                          style={{ width: "20px", height: "20px", accentColor }}
                        />
                        <label
                          htmlFor="remote-check"
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          OPEN TO REMOTE
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <SectionHeader title="Company Broadcaster" />
                    <Field label="Company Name">
                      <Input
                        name="company_name"
                        value={formData.company_name}
                        onChange={handleInputChange}
                        accent={accentColor}
                      />
                    </Field>
                    <Field label="Website">
                      <Input
                        name="company_website"
                        type="url"
                        value={formData.company_website}
                        onChange={handleInputChange}
                        accent={accentColor}
                      />
                    </Field>
                    <Field label="Description">
                      <TextArea
                        name="company_description"
                        value={formData.company_description}
                        onChange={handleInputChange}
                        accent={accentColor}
                      />
                    </Field>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "24px",
                      }}
                    >
                      <Field label="Industry">
                        <Input
                          name="industry"
                          value={formData.industry}
                          onChange={handleInputChange}
                          accent={accentColor}
                        />
                      </Field>
                      <Field label="Size">
                        <Input
                          name="company_size"
                          value={formData.company_size}
                          onChange={handleInputChange}
                          accent={accentColor}
                        />
                      </Field>
                    </div>
                  </>
                )}
                <SubmitButton
                  label="UPDATE PROFESSIONAL"
                  loading={updateRoleProfile.isPending}
                  accent={accentColor}
                />
              </form>
            )}

            {/* ─── SECURITY TAB ─── */}
            {activeTab === "security" && (
              <form
                onSubmit={handleChangePassword}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "32px",
                }}
              >
                <SectionHeader title="Cipher Sequence Update" />
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--tx-ink-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  Update your security passphrase. This will terminate all
                  active broadcast sessions.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
                  }}
                >
                  <Field label="Current Passphrase">
                    <Input
                      name="current_password"
                      type="password"
                      value={passwordData.current_password}
                      onChange={handlePasswordChange}
                      accent={accentColor}
                    />
                  </Field>
                  <Field label="New Passphrase">
                    <Input
                      name="new_password"
                      type="password"
                      value={passwordData.new_password}
                      onChange={handlePasswordChange}
                      accent={accentColor}
                    />
                  </Field>
                  <Field label="Confirm Passphrase">
                    <Input
                      name="confirm_password"
                      type="password"
                      value={passwordData.confirm_password}
                      onChange={handlePasswordChange}
                      accent={accentColor}
                    />
                  </Field>
                </div>
                <SubmitButton
                  label="UPDATE CIPHER"
                  loading={changePassword.isPending}
                  accent={accentColor}
                />
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── UI COMPONENTS ─────────────────────────────────────────────────────── */

function TabButton({
  active,
  label,
  onClick,
  accent,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "16px 20px",
        fontFamily: "var(--tx-font-mono)",
        fontSize: "13px",
        fontWeight: 800,
        textAlign: "left",
        letterSpacing: "2px",
        background: active ? accent : "transparent",
        color: active ? "white" : "var(--tx-ink)",
        border: active ? `2px solid var(--tx-border)` : "2px solid transparent",
        borderRadius: "var(--tx-radius)",
        cursor: "pointer",
        transition: "all 150ms var(--tx-ease-sharp)",
        boxShadow: active ? "4px 4px 0px var(--tx-border)" : "none",
        transform: active ? "translate(-2px, -2px)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2
      style={{
        fontSize: "16px",
        fontWeight: 800,
        letterSpacing: "2px",
        borderBottom: "2px solid var(--tx-border)",
        paddingBottom: "12px",
        marginBottom: "8px",
      }}
    >
      {title}
    </h2>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <label
        style={{
          fontSize: "10px",
          fontWeight: 800,
          color: "var(--tx-ink-muted)",
          letterSpacing: "1px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ accent, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { accent: string }) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "12px 14px",
        fontFamily: "var(--tx-font-mono)",
        fontSize: "13px",
        background: "var(--tx-bg)",
        border: "2px solid var(--tx-border)",
        borderRadius: "var(--tx-radius)",
        outline: "none",
        ...props.style,
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--tx-border)")}
    />
  );
}

function TextArea({ accent, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { accent: string }) {
  return (
    <textarea
      {...props}
      rows={4}
      style={{
        width: "100%",
        padding: "12px 14px",
        fontFamily: "var(--tx-font-mono)",
        fontSize: "13px",
        background: "var(--tx-bg)",
        border: "2px solid var(--tx-border)",
        borderRadius: "var(--tx-radius)",
        outline: "none",
        resize: "vertical",
        ...props.style,
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--tx-border)")}
    />
  );
}

function Select({ accent, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { accent: string }) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        padding: "12px 14px",
        fontFamily: "var(--tx-font-mono)",
        fontSize: "13px",
        background: "var(--tx-bg)",
        border: "2px solid var(--tx-border)",
        borderRadius: "var(--tx-radius)",
        outline: "none",
        cursor: "pointer",
        ...props.style,
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--tx-border)")}
    >
      {children}
    </select>
  );
}

function SubmitButton({
  label,
  loading,
  accent,
}: {
  label: string;
  loading: boolean;
  accent: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        padding: "14px 28px",
        fontFamily: "var(--tx-font-mono)",
        fontSize: "13px",
        fontWeight: 800,
        letterSpacing: "2px",
        color: "white",
        background: accent,
        border: `2px solid var(--tx-border)`,
        borderRadius: "var(--tx-radius)",
        cursor: loading ? "not-allowed" : "pointer",
        transition: "all 150ms var(--tx-ease-sharp)",
        boxShadow: "4px 4px 0px var(--tx-border)",
        alignSelf: "flex-end",
        marginTop: "16px",
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.transform = "translate(-2px, -2px)";
      }}
      onMouseLeave={(e) => {
        if (!loading) e.currentTarget.style.transform = "translate(0, 0)";
      }}
    >
      {loading ? "PROCESSING..." : label}
    </button>
  );
}
