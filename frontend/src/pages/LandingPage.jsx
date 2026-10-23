import { Link } from "react-router-dom";

const suggestionTracks = [
  {
    title: "Engineering and Technology",
    copy: "For students strong in maths, physics, problem solving, and technical projects."
  },
  {
    title: "Medical and Allied Health",
    copy: "For students focused on biology, patient care, nursing, pharmacy, or public health."
  },
  {
    title: "Commerce and Management",
    copy: "For students interested in business, accounting, finance, entrepreneurship, and operations."
  },
  {
    title: "Arts, Design, and Media",
    copy: "For students exploring communication, visual design, psychology, writing, and digital creativity."
  }
];

export default function LandingPage({ isAuthenticated, currentUser, onLogout }) {
  const primaryLink = isAuthenticated
    ? currentUser?.profileComplete
      ? "/dashboard"
      : "/profile-setup"
    : "/signup";
  const primaryLabel = isAuthenticated
    ? currentUser?.profileComplete
      ? "Open Dashboard"
      : "Continue Setup"
    : "Create Student Account";
  const userLabel = currentUser?.name || currentUser?.email || "User";

  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="brand-kicker">EduVista</p>
          <div className="landing-marquee">
            <h2>EDUVISTA</h2>
          </div>
          <p className="landing-subtitle">
            Students create accounts, complete academic profiles, and apply to matching programs.
            Universities onboard with their own profile, publish courses with eligibility rules,
            and review applicants in a dedicated dashboard.
          </p>

          {!isAuthenticated ? (
            <div className="landing-actions">
              <Link className="landing-primary" to={primaryLink}>
                {primaryLabel}
              </Link>
              <Link className="landing-secondary" to="/login">
                Login
              </Link>
            </div>
          ) : (
            <div className="landing-auth-note">
              You are already signed in. Dashboard and logout actions are available in the right panel.
            </div>
          )}

          {!isAuthenticated ? (
            <div className="type-switch top-gap">
              <Link className="type-card active" to="/signup">
                <span>Student Access</span>
                <small>Create a student account, complete the profile, and apply for courses.</small>
              </Link>
              <Link className="type-card active" to="/signup?type=university">
                <span>University Access</span>
                <small>Onboard the institution, publish programs, and review applications.</small>
              </Link>
            </div>
          ) : null}

          <div className="landing-stat-row">
            <div className="landing-stat">
              <strong>Dual workspace</strong>
              <span>Students and universities use role-specific flows on the same platform.</span>
            </div>
            <div className="landing-stat">
              <strong>Profile-first flow</strong>
              <span>Students and universities complete their profile before dashboard access.</span>
            </div>
            <div className="landing-stat">
              <strong>Publish + apply</strong>
              <span>Universities publish courses and students apply only when eligible.</span>
            </div>
          </div>
        </div>

        <aside className="landing-panel">
          {isAuthenticated ? (
            <div className="landing-session-card">
              <div className="landing-session-head">
                <span>Signed In</span>
                <strong>{userLabel}</strong>
                <p>{currentUser?.role} account ready on this device.</p>
              </div>
              <div className="landing-session-actions">
                <Link className="landing-primary" to={primaryLink}>
                  {primaryLabel}
                </Link>
                <button type="button" className="landing-secondary landing-logout" onClick={onLogout}>
                  Logout
                </button>
              </div>
            </div>
          ) : null}

          <div className="landing-mini-card">
            <span>Step 1</span>
            <strong>Create an account</strong>
            <p>Students and universities each have their own signup and login path.</p>
          </div>
          <div className="landing-mini-card">
            <span>Step 2</span>
            <strong>Complete profile setup</strong>
            <p>Students add academic records. Universities add institution details and branding.</p>
          </div>
          <div className="landing-mini-card">
            <span>Step 3</span>
            <strong>Open the dashboard</strong>
            <p>Students browse and apply. Universities publish courses and review applications.</p>
          </div>
        </aside>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="brand-kicker">Suggestion Tracks</p>
          <h2>Start with broad directions, then narrow down colleges and courses.</h2>
        </div>
        <div className="landing-grid">
          {suggestionTracks.map((item) => (
            <article key={item.title} className="landing-card">
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-muted">
        <div className="landing-section-head">
          <p className="brand-kicker">Why This Flow</p>
          <h2>The dashboard opens only after the role-specific profile is complete.</h2>
        </div>
        <div className="landing-grid two">
          <article className="landing-card">
            <h3>Better student matching</h3>
            <p>
              Student board, marks, level, and uploaded documents give the system enough context
              to surface more relevant options and eligibility states.
            </p>
          </article>
          <article className="landing-card">
            <h3>Stronger university listings</h3>
            <p>
              Every university profile and course listing is stored with admissions details before
              applications begin, so students see a cleaner catalog.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
