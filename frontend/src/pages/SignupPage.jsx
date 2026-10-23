import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";

export default function SignupPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({
    accountType: searchParams.get("type") === "university" ? "university" : "student",
    fullName: "",
    universityName: "",
    email: "",
    password: "",
    confirmPassword: "",
    academicLevel: "12",
    phone: "",
    guardianPhone: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const accountType = searchParams.get("type") === "university" ? "university" : "student";
    setForm((current) => ({ ...current, accountType }));
  }, [searchParams]);

  const isStudent = form.accountType === "student";

  const switchAccountType = (accountType) => {
    const next = new URLSearchParams(searchParams);
    if (accountType === "student") {
      next.delete("type");
    } else {
      next.set("type", accountType);
    }
    setSearchParams(next, { replace: true });
  };

  const journeySteps = isStudent
    ? [
        { icon: "📝", title: "Create your login", desc: "Use email, password, and your academic level." },
        { icon: "📄", title: "Complete your profile", desc: "Add school, board, marks & documents." },
        { icon: "🎯", title: "Explore & apply", desc: "Smart suggestions and application tracking." }
      ]
    : [
        { icon: "🏛️", title: "Create institution account", desc: "Start with contact details and institution name." },
        { icon: "⚙️", title: "Finish onboarding", desc: "Add branding, location, and admissions details." },
        { icon: "📊", title: "Publish & review", desc: "Create courses and review student applications." }
      ];

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.password.length < 6) {
      setError("Password must have at least 6 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Password and confirm password must match.");
      return;
    }

    if (isStudent && (!form.phone.trim() || !form.guardianPhone.trim())) {
      setError("Student phone and parent phone are required.");
      return;
    }

    if (!isStudent) {
      if (!form.fullName.trim()) {
        setError("Admissions contact name is required.");
        return;
      }
      if (!form.universityName.trim()) {
        setError("University name is required.");
        return;
      }
    }

    setLoading(true);
    try {
      const result = await api.signup({
        accountType: form.accountType,
        fullName: form.fullName,
        universityName: form.universityName,
        email: form.email,
        password: form.password,
        academicLevel: form.academicLevel,
        phone: form.phone,
        guardianPhone: form.guardianPhone
      });
      onAuthSuccess(result);
      navigate("/profile-setup", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const setField = (key) => (e) => setForm((c) => ({ ...c, [key]: e.target.value }));

  return (
    <div className="cool-auth-shell">
      <div className="cool-auth-orb cool-auth-orb-1" />
      <div className="cool-auth-orb cool-auth-orb-2" />
      <div className="cool-auth-orb cool-auth-orb-3" />

      <div className="cool-signup-container">
        {/* Left – Brand / Journey */}
        <div className="cool-signup-brand">
          <div className="cool-signup-brand-inner">
            <div className="cool-login-logo" style={{ marginBottom: "1.5rem" }}>
              <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
                <rect width="42" height="42" rx="12" fill="url(#sg1)" />
                <path d="M12 28V14l9 7-9 7z" fill="rgba(255,255,255,0.95)" />
                <path d="M21 21l9-7v14l-9-7z" fill="rgba(255,255,255,0.5)" />
                <defs>
                  <linearGradient id="sg1" x1="0" y1="0" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="cool-login-logo-text">EduVista</span>
            </div>

            <h1 className="cool-signup-hero-title">
              {isStudent
                ? "Start your academic journey today"
                : "Build your institution's digital presence"}
            </h1>
            <p className="cool-signup-hero-sub">
              {isStudent
                ? "Create your profile, get smart course recommendations, and apply to top institutions — all in one place."
                : "Publish courses, manage admissions, and connect with students through a modern digital workspace."}
            </p>

            <div className="cool-signup-steps">
              {journeySteps.map((step, i) => (
                <div key={step.title} className="cool-signup-step">
                  <div className="cool-signup-step-num">{step.icon}</div>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right – Form */}
        <div className="cool-signup-form-panel">
          <div className="cool-signup-form-inner">
            <div className="cool-signup-form-header">
              <h2>Create Account</h2>
              <p>
                {isStudent
                  ? "Set up your student login — detailed profile comes next"
                  : "Set up your institution workspace — onboarding continues after"}
              </p>
            </div>

            <div className="cool-signup-type-tabs">
              <button
                type="button"
                className={`cool-signup-tab ${isStudent ? "active" : ""}`}
                onClick={() => switchAccountType("student")}
              >
                <span className="cool-signup-tab-icon">🎓</span>
                Student
                <span className="cool-signup-tab-label">Profile & apply</span>
              </button>
              <button
                type="button"
                className={`cool-signup-tab ${!isStudent ? "active" : ""}`}
                onClick={() => switchAccountType("university")}
              >
                <span className="cool-signup-tab-icon">🏛️</span>
                University
                <span className="cool-signup-tab-label">Publish & review</span>
              </button>
            </div>

            <form className="cool-signup-form" onSubmit={handleSubmit}>
              {!isStudent ? (
                <div className="cool-signup-row">
                  <div className="cool-input-group">
                    <label>Contact Name</label>
                    <div className="cool-input-wrapper">
                      <span className="cool-input-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <input placeholder="Your name" value={form.fullName} onChange={setField("fullName")} required />
                    </div>
                  </div>
                  <div className="cool-input-group">
                    <label>University Name</label>
                    <div className="cool-input-wrapper">
                      <span className="cool-input-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 20h20" /><path d="M5 20V8l7-5 7 5v12" /><rect x="9" y="12" width="6" height="8" />
                        </svg>
                      </span>
                      <input placeholder="Institution name" value={form.universityName} onChange={setField("universityName")} required />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="cool-input-group">
                <label>Email Address</label>
                <div className="cool-input-wrapper">
                  <span className="cool-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                  <input type="email" placeholder="you@example.com" value={form.email} onChange={setField("email")} required />
                </div>
              </div>

              {isStudent ? (
                <>
                  <div className="cool-signup-row">
                    <div className="cool-input-group">
                      <label>Academic Level</label>
                      <div className="cool-input-wrapper">
                        <span className="cool-input-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 10 3 12 0v-5" />
                          </svg>
                        </span>
                        <select value={form.academicLevel} onChange={setField("academicLevel")}>
                          <option value="10">10th student</option>
                          <option value="12">12th student</option>
                        </select>
                      </div>
                    </div>
                    <div className="cool-input-group">
                      <label>Student Phone</label>
                      <div className="cool-input-wrapper">
                        <span className="cool-input-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </span>
                        <input placeholder="Your number" value={form.phone} onChange={setField("phone")} required />
                      </div>
                    </div>
                  </div>
                  <div className="cool-input-group">
                    <label>Parent / Guardian Phone</label>
                    <div className="cool-input-wrapper">
                      <span className="cool-input-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </span>
                      <input placeholder="Parent's number" value={form.guardianPhone} onChange={setField("guardianPhone")} required />
                    </div>
                  </div>
                </>
              ) : null}

              <div className="cool-signup-row">
                <div className="cool-input-group">
                  <label>Password</label>
                  <div className="cool-input-wrapper">
                    <span className="cool-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={form.password}
                      onChange={setField("password")}
                      required
                    />
                  </div>
                </div>
                <div className="cool-input-group">
                  <label>Confirm Password</label>
                  <div className="cool-input-wrapper">
                    <span className="cool-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Re-enter password"
                      value={form.confirmPassword}
                      onChange={setField("confirmPassword")}
                      required
                    />
                    <button
                      type="button"
                      className="cool-input-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

              {error ? (
                <div className="cool-auth-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {error}
                </div>
              ) : null}

              <button type="submit" className="cool-auth-submit" disabled={loading}>
                {loading ? <span className="cool-auth-spinner" /> : null}
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>

            <div className="cool-signup-footer">
              <p>
                Already have an account?{" "}
                <Link to={isStudent ? "/login" : "/login?type=university"}>Sign in</Link>
              </p>
              <p className="cool-signup-disclaimer">
                {isStudent
                  ? "After signup, detailed profile setup is mandatory before dashboard access."
                  : "After signup, the institution profile must be completed before dashboard access."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
