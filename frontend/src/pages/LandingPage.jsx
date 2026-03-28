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

export default function LandingPage({ isAuthenticated, currentUser }) {
  const primaryLink = isAuthenticated ? "/dashboard" : "/signup";
  const primaryLabel = isAuthenticated ? "Open Dashboard" : "Create Student Account";

  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="brand-kicker">EduVista</p>
          <h1>Course suggestions and registration guidance for 10th and 12th students.</h1>
          <p className="landing-subtitle">
            Students create an account, complete their academic profile, upload their marksheet and
            supporting documents, and then explore suggested higher-study options with a structured
            registration workflow.
          </p>

          <div className="landing-actions">
            <Link className="landing-primary" to={primaryLink}>
              {primaryLabel}
            </Link>
            <Link className="landing-secondary" to={isAuthenticated ? "/" : "/login"}>
              {isAuthenticated ? "Stay on Home" : "Student Login"}
            </Link>
          </div>

          <div className="landing-stat-row">
            <div className="landing-stat">
              <strong>10th / 12th only</strong>
              <span>Built for school-leaving students planning the next step.</span>
            </div>
            <div className="landing-stat">
              <strong>Profile-first flow</strong>
              <span>Academic details and documents are captured before dashboard access.</span>
            </div>
            <div className="landing-stat">
              <strong>Suggestion + application</strong>
              <span>Discover suitable courses and track applications in one place.</span>
            </div>
          </div>
        </div>

        <aside className="landing-panel">
          <div className="landing-mini-card">
            <span>Step 1</span>
            <strong>Create a student account</strong>
            <p>Email, password, 10th/12th level, student phone, and parent phone.</p>
          </div>
          <div className="landing-mini-card">
            <span>Step 2</span>
            <strong>Complete profile setup</strong>
            <p>Add board, school, marks, target course interest, and upload your document.</p>
          </div>
          <div className="landing-mini-card">
            <span>Step 3</span>
            <strong>Open the dashboard</strong>
            <p>Browse suggestions, compare colleges, and submit course applications.</p>
          </div>
          {currentUser?.role === "student" ? (
            <div className="landing-user-chip">
              Logged in as {currentUser.name || currentUser.email}
            </div>
          ) : null}
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
          <h2>The dashboard opens only after the academic profile is complete.</h2>
        </div>
        <div className="landing-grid two">
          <article className="landing-card">
            <h3>Better course suggestions</h3>
            <p>
              Board, marks, level, target interest, and uploaded marksheet give the system enough
              context to surface more relevant options.
            </p>
          </article>
          <article className="landing-card">
            <h3>Clean student records</h3>
            <p>
              Every profile and uploaded academic document is stored against the student account in
              the database before applications begin.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
