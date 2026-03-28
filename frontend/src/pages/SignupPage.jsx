import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

export default function SignupPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    academicLevel: "12",
    phone: "",
    guardianPhone: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    if (!form.phone.trim() || !form.guardianPhone.trim()) {
      setError("Student phone and parent phone are required.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.signup({
        accountType: "student",
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

  return (
    <div className="auth-shell">
      <div className="auth-panel auth-panel-wide">
        <div className="auth-intro">
          <div>
            <p className="brand-kicker">EduVista</p>
            <h1 className="auth-title">Create a student account</h1>
            <p className="auth-subtitle">
              This registration flow is only for 10th and 12th students who want course
              suggestions and guided application tracking.
            </p>
          </div>
          <div className="auth-note-card">
            <strong>What happens next</strong>
            <p>
              After account creation you will be taken to a detailed profile setup page to upload
              academic details and supporting documents before opening the dashboard.
            </p>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-columns two">
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
              Academic level
              <select
                value={form.academicLevel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, academicLevel: event.target.value }))
                }
              >
                <option value="10">10th student</option>
                <option value="12">12th student</option>
              </select>
            </label>

            <label>
              Student phone number
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                required
              />
            </label>

            <label>
              Father / mother phone number
              <input
                value={form.guardianPhone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, guardianPhone: event.target.value }))
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
              Confirm password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    confirmPassword: event.target.value
                  }))
                }
                required
              />
            </label>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="auth-strip">
          <p className="auth-footnote">
            Already registered? <Link to="/login">Back to login</Link>
          </p>
          <p className="small-note">
            After signup, detailed academic profile setup is mandatory before dashboard access.
          </p>
        </div>
      </div>
    </div>
  );
}
