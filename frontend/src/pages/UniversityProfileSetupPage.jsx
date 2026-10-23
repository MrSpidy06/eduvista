import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

export default function UniversityProfileSetupPage({
  token,
  currentUser,
  onSessionUserUpdate,
  onLogout
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileReady, setProfileReady] = useState(Boolean(currentUser?.profileComplete));
  const [form, setForm] = useState({
    fullName: "",
    departmentId: "",
    universityName: "",
    shortName: "",
    state: "",
    city: "",
    addressLine: "",
    websiteUrl: "",
    contactEmail: "",
    contactPhone: "",
    accreditation: "",
    description: "",
    logoPath: "",
    bannerPath: "",
    applicationBarLabel: ""
  });

  const checklist = useMemo(
    () => [
      { label: "Institution Name", icon: "🏛️", done: Boolean(form.universityName) },
      { label: "State", icon: "📍", done: Boolean(form.state) },
      { label: "City / Location", icon: "🌆", done: Boolean(form.city) }
    ],
    [form]
  );

  const completedCount = checklist.filter((c) => c.done).length;
  const progress = Math.round((completedCount / checklist.length) * 100);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const [profileResult, meResult] = await Promise.all([api.profile(token), api.me(token)]);

      onSessionUserUpdate(meResult.user);
      setProfileReady(Boolean(meResult.user.profileComplete));
      setForm({
        fullName: profileResult.profile?.full_name || meResult.user.name || "",
        departmentId: String(profileResult.profile?.department_id || meResult.user.departmentId || ""),
        universityName: profileResult.profile?.university_name || meResult.user.universityName || "",
        shortName: profileResult.profile?.short_name || "",
        state: profileResult.profile?.state || "",
        city: profileResult.profile?.city || "",
        addressLine: profileResult.profile?.address_line || "",
        websiteUrl: profileResult.profile?.website_url || "",
        contactEmail: profileResult.profile?.contact_email || meResult.user.email || "",
        contactPhone: profileResult.profile?.contact_phone || "",
        accreditation: profileResult.profile?.accreditation || "",
        description: profileResult.profile?.description || "",
        logoPath: profileResult.profile?.logo_path || meResult.user.logoPath || "",
        bannerPath: profileResult.profile?.banner_path || meResult.user.bannerPath || "",
        applicationBarLabel: profileResult.profile?.application_bar_label || ""
      });
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load university profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.updateProfile(token, {
        ...form,
        departmentId: form.departmentId ? Number(form.departmentId) : null
      });
      const meResult = await api.me(token);
      onSessionUserUpdate(meResult.user);
      setProfileReady(Boolean(meResult.user.profileComplete));
      setNotice("Profile saved successfully!");
      if (meResult.user.profileComplete) {
        navigate("/dashboard", { replace: true });
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to save university profile.");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key) => (e) => setForm((c) => ({ ...c, [key]: e.target.value }));

  if (loading) {
    return (
      <div className="cool-auth-shell">
        <div className="cool-auth-orb cool-auth-orb-1" />
        <div className="cool-auth-orb cool-auth-orb-2" />
        <div className="cool-setup-loader">
          <span className="cool-auth-spinner" style={{ width: 32, height: 32 }} />
          <p>Loading institution profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cool-auth-shell">
      <div className="cool-auth-orb cool-auth-orb-1" />
      <div className="cool-auth-orb cool-auth-orb-2" />
      <div className="cool-auth-orb cool-auth-orb-3" />

      <div className="cool-setup-container">
        {/* Left panel — Progress & info */}
        <div className="cool-setup-brand">
          <div className="cool-setup-brand-inner">
            <div className="cool-login-logo" style={{ marginBottom: "1.5rem" }}>
              <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
                <rect width="42" height="42" rx="12" fill="url(#sp1)" />
                <path d="M12 28V14l9 7-9 7z" fill="rgba(255,255,255,0.95)" />
                <path d="M21 21l9-7v14l-9-7z" fill="rgba(255,255,255,0.5)" />
                <defs>
                  <linearGradient id="sp1" x1="0" y1="0" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="cool-login-logo-text">EduVista</span>
            </div>

            <h1 className="cool-setup-hero-title">
              Complete Your Institution Profile
            </h1>
            <p className="cool-setup-hero-sub">
              Fill in the essential details to set up your institution's presence on EduVista. This only takes a minute.
            </p>

            {/* Progress bar */}
            <div className="cool-setup-progress">
              <div className="cool-setup-progress-header">
                <span>Profile Completion</span>
                <span className="cool-setup-progress-pct">{progress}%</span>
              </div>
              <div className="cool-setup-progress-bar">
                <div
                  className="cool-setup-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Checklist */}
            <div className="cool-setup-checklist">
              {checklist.map((item) => (
                <div
                  key={item.label}
                  className={`cool-setup-check-item ${item.done ? "done" : ""}`}
                >
                  <div className={`cool-setup-check-icon ${item.done ? "done" : ""}`}>
                    {item.done ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span>{item.icon}</span>
                    )}
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="cool-setup-side-actions">
              <button
                type="button"
                className="cool-setup-dashboard-btn"
                disabled={!profileReady}
                onClick={() => navigate("/dashboard", { replace: true })}
              >
                Continue to Dashboard →
              </button>
              <button
                type="button"
                className="cool-setup-logout-btn"
                onClick={onLogout}
              >
                Log out
              </button>
            </div>
          </div>
        </div>

        {/* Right panel — Form */}
        <div className="cool-setup-form-panel">
          <div className="cool-setup-form-inner">
            <div className="cool-setup-form-header">
              <h2>Institution Details</h2>
              <p>These fields are required to activate your dashboard</p>
            </div>

            {error ? (
              <div className="cool-auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
            ) : null}

            {notice ? (
              <div className="cool-setup-notice">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                {notice}
              </div>
            ) : null}

            <form className="cool-setup-form" onSubmit={saveProfile}>
              <div className="cool-input-group">
                <label>Institution Name *</label>
                <div className="cool-input-wrapper">
                  <span className="cool-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 20h20" /><path d="M5 20V8l7-5 7 5v12" /><rect x="9" y="12" width="6" height="8" />
                    </svg>
                  </span>
                  <input
                    placeholder="e.g. College of Engineering Trivandrum"
                    value={form.universityName}
                    onChange={setField("universityName")}
                    required
                  />
                </div>
              </div>

              <div className="cool-signup-row">
                <div className="cool-input-group">
                  <label>State *</label>
                  <div className="cool-input-wrapper">
                    <span className="cool-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <select
                      value={form.state}
                      onChange={setField("state")}
                      required
                    >
                      <option value="" disabled>Select a state</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cool-input-group">
                  <label>City / Location *</label>
                  <div className="cool-input-wrapper">
                    <span className="cool-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <input
                      placeholder="e.g. Thiruvananthapuram"
                      value={form.city}
                      onChange={setField("city")}
                      required
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="cool-auth-submit" disabled={saving}>
                {saving ? <span className="cool-auth-spinner" /> : null}
                {saving ? "Saving..." : "Save & Continue"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
