import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";

const resolveAuthDestination = (user) =>
  user && ["student", "university"].includes(user.role) && !user.profileComplete
    ? "/profile-setup"
    : "/dashboard";

export default function LoginPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const audience = searchParams.get("type") === "university" ? "university" : "student";
  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    setLoading(true);
    try {
      const result = await api.login(form);
      onAuthSuccess(result);
      navigate(resolveAuthDestination(result.user), { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cool-auth-shell">
      {/* Animated background orbs */}
      <div className="cool-auth-orb cool-auth-orb-1" />
      <div className="cool-auth-orb cool-auth-orb-2" />
      <div className="cool-auth-orb cool-auth-orb-3" />

      <div className="cool-login-container">
        {/* Left - Branding panel */}
        <div className="cool-login-brand">
          <div className="cool-login-brand-inner">
            <div className="cool-login-logo">
              <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
                <rect width="42" height="42" rx="12" fill="url(#lg1)" />
                <path d="M12 28V14l9 7-9 7z" fill="rgba(255,255,255,0.95)" />
                <path d="M21 21l9-7v14l-9-7z" fill="rgba(255,255,255,0.5)" />
                <defs>
                  <linearGradient id="lg1" x1="0" y1="0" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="cool-login-logo-text">EduVista</span>
            </div>

            <h1 className="cool-login-hero-title">
              {audience === "university"
                ? "Welcome back, Institution"
                : "Welcome back, Student"}
            </h1>
            <p className="cool-login-hero-sub">
              {audience === "university"
                ? "Sign in to manage courses, review applications, and grow your institution's digital presence."
                : "Sign in to explore courses, track applications, and continue your academic journey."}
            </p>

            <div className="cool-login-features">
              {audience === "university" ? (
                <>
                  <div className="cool-login-feature-item">
                    <div className="cool-login-feature-icon">📊</div>
                    <div>
                      <strong>Course Management</strong>
                      <p>Publish and manage courses effortlessly</p>
                    </div>
                  </div>
                  <div className="cool-login-feature-item">
                    <div className="cool-login-feature-icon">📋</div>
                    <div>
                      <strong>Application Review</strong>
                      <p>Review and shortlist applicants in one view</p>
                    </div>
                  </div>
                  <div className="cool-login-feature-item">
                    <div className="cool-login-feature-icon">🏛️</div>
                    <div>
                      <strong>Institution Dashboard</strong>
                      <p>Everything your institution needs, in one place</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="cool-login-feature-item">
                    <div className="cool-login-feature-icon">🎓</div>
                    <div>
                      <strong>Smart Matching</strong>
                      <p>AI-powered course recommendations</p>
                    </div>
                  </div>
                  <div className="cool-login-feature-item">
                    <div className="cool-login-feature-icon">📄</div>
                    <div>
                      <strong>Application Tracking</strong>
                      <p>Monitor all your applications in real-time</p>
                    </div>
                  </div>
                  <div className="cool-login-feature-item">
                    <div className="cool-login-feature-icon">🔔</div>
                    <div>
                      <strong>Instant Updates</strong>
                      <p>Get notified when application status changes</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right - Form panel */}
        <div className="cool-login-form-panel">
          <div className="cool-login-form-inner">
            <div className="cool-login-form-header">
              <h2>Sign In</h2>
              <p>Enter your credentials to access your account</p>
            </div>

            <div className="cool-login-type-tabs">
              <Link
                className={`cool-login-tab ${audience === "student" ? "active" : ""}`}
                to="/login"
              >
                <span className="cool-login-tab-icon">🎓</span>
                Student
              </Link>
              <Link
                className={`cool-login-tab ${audience === "university" ? "active" : ""}`}
                to="/login?type=university"
              >
                <span className="cool-login-tab-icon">🏛️</span>
                University
              </Link>
            </div>

            <form className="cool-login-form" onSubmit={handleSubmit}>
              <div className="cool-input-group">
                <label htmlFor="login-email">Email Address</label>
                <div className="cool-input-wrapper">
                  <span className="cool-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="cool-input-group">
                <label htmlFor="login-password">Password</label>
                <div className="cool-input-wrapper">
                  <span className="cool-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))}
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

              {error ? (
                <div className="cool-auth-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {error}
                </div>
              ) : null}

              <button type="submit" className="cool-auth-submit" disabled={loading}>
                {loading ? (
                  <span className="cool-auth-spinner" />
                ) : null}
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="cool-login-footer">
              <p>
                Don't have an account?{" "}
                <Link to={audience === "university" ? "/signup?type=university" : "/signup"}>
                  Create one now
                </Link>
              </p>
              <Link to="/" className="cool-login-back">
                ← Back to website
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
