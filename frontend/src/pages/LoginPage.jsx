import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
export default function LoginPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    captchaId: "",
    captchaAnswer: ""
  });
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [error, setError] = useState("");

  const refreshCaptcha = async () => {
    setLoadingCaptcha(true);
    try {
      const result = await api.captcha();
      setCaptchaQuestion(result.question);
      setForm((current) => ({
        ...current,
        captchaId: result.captchaId,
        captchaAnswer: ""
      }));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    refreshCaptcha();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.captchaAnswer.trim()) {
      setError("Solve the CAPTCHA challenge.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.login(form);
      onAuthSuccess(result);
      navigate(result.user?.profileComplete ? "/dashboard" : "/profile-setup", {
        replace: true
      });
    } catch (requestError) {
      setError(requestError.message);
      await refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-panel auth-panel-compact auth-panel-dark">
        <div className="auth-badge">EduVista Student Access</div>
        <h1 className="auth-title compact">Log in to continue</h1>
        <p className="auth-subtitle compact">
          Sign in to finish profile setup, view course suggestions, and continue applications.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </label>

          <label>
            Simple CAPTCHA
            <div className="captcha-row">
              <span className="captcha-question">{captchaQuestion || "Loading..."}</span>
              <button
                type="button"
                className="secondary-btn"
                onClick={refreshCaptcha}
                disabled={loadingCaptcha}
              >
                {loadingCaptcha ? "..." : "Refresh"}
              </button>
            </div>
            <input
              type="text"
              value={form.captchaAnswer}
              onChange={(event) =>
                setForm((current) => ({ ...current, captchaAnswer: event.target.value }))
              }
              placeholder="Enter answer"
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" disabled={loading || loadingCaptcha}>
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="auth-strip">
          <p className="auth-footnote">
            New here? <Link to="/signup">Create student account</Link>
          </p>
          <p className="auth-footnote">
            <Link to="/">Back to website</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
