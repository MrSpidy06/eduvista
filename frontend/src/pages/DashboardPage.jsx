import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import {
  buildAllCourseSuggestionOptions,
  buildCourseSuggestionGroups,
  COURSE_CATEGORY_OPTIONS,
  COURSE_DELIVERY_MODE_OPTIONS,
  detectRecommendedAcademicLevel
} from "../lib/courseOptions.js";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(
  /\/api$/,
  ""
);

const STATUS_TONES = {
  submitted: "warn",
  under_review: "warn",
  shortlisted: "ok",
  accepted: "ok",
  rejected: "bad",
  registered: "ok",
  pending: "warn",
  open: "ok",
  closed: "bad",
  ready: "ok",
  incomplete: "warn",
  draft: "muted",
  eligible: "ok",
  ineligible: "bad",
  high: "ok",
  medium: "warn",
  low: "muted",
  university: "muted",
  student: "muted",
  admin: "muted"
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
};

const toAssetUrl = (filePath) => {
  if (!filePath) {
    return "";
  }
  if (filePath.startsWith("http")) {
    return filePath;
  }
  return `${API_ORIGIN}${filePath}`;
};

const toMessage = (requestError) => {
  let message = requestError.message;
  if (Array.isArray(requestError.details) && requestError.details.length > 0) {
    message = `${message} ${requestError.details.join(" ")}`;
  }
  if (requestError.missingPrerequisites?.length) {
    message += ` Missing prerequisites: ${requestError.missingPrerequisites.join(", ")}.`;
  }
  if (requestError.conflictWith?.length) {
    message += ` Conflicts with: ${requestError.conflictWith.join(", ")}.`;
  }
  return message;
};

function StatusPill({ status }) {
  const normalized = String(status || "").toLowerCase();
  const tone = STATUS_TONES[normalized] || "muted";
  return <span className={`status-pill ${tone}`}>{normalized.replace(/_/g, " ")}</span>;
}

function StatCard({ label, value, note }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <h3>{value}</h3>
      <small>{note}</small>
    </article>
  );
}

function Panel({ title, note, actions, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {note ? <p className="panel-note">{note}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ copy }) {
  return <p className="empty-copy">{copy}</p>;
}

const formatEligibilityLabel = (course) => {
  if (course.eligibility_summary) {
    return course.eligibility_summary;
  }
  if (Array.isArray(course.eligible_academic_levels) && course.eligible_academic_levels.length) {
    return `${course.eligible_academic_levels.map((level) => `${level}th`).join(" / ")} students`;
  }
  return "Open to all students";
};

const formatEligibleAcademicLevels = (value) => {
  const levels = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (levels.length === 0) {
    return "Open";
  }

  return `${levels.map((level) => `${level}th`).join(" / ")}`;
};

const formatDeliveryMode = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "both") {
    return "Online + Offline";
  }
  if (normalized === "online") {
    return "Online";
  }
  if (normalized === "offline") {
    return "Offline";
  }
  return "Not set";
};

const buildCourseUploadWarnings = (courseForm, profileForm) => {
  const warnings = [];
  const qualification = String(courseForm.qualificationRequired || "").toLowerCase();
  const eligibleLevels = String(courseForm.eligibleAcademicLevels || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const recommendedAcademicLevel = detectRecommendedAcademicLevel(courseForm.title);

  if (!String(profileForm.universityName || "").trim()) {
    warnings.push("Set the college name in University Profile before publishing a course.");
  }

  if (eligibleLevels.length === 0) {
    warnings.push("Select whether 10th students, 12th students, or both can apply.");
  }

  if (
    eligibleLevels.length === 1 &&
    eligibleLevels[0] === "10" &&
    /(10\+2|12th|pcm|pcb|jee|neet|keam)/i.test(qualification)
  ) {
    warnings.push("10th-only selection conflicts with a qualification that reads like a 12th-level admission.");
  }

  if (recommendedAcademicLevel && !eligibleLevels.includes(recommendedAcademicLevel)) {
    warnings.push(
      `"${courseForm.title}" is usually an after ${recommendedAcademicLevel === "10" ? "10th" : "12th"} listing. Check the grade selection.`
    );
  }

  if (/(relevant ug|ug degree|graduate|graduation|bachelor|post basic|postgraduate|master)/i.test(qualification)) {
    warnings.push("This qualification reads like a UG/PG entry course. EduVista should stay focused on school-level admissions.");
  }

  return warnings;
};

function DashboardShell({
  profile,
  pages,
  activePage,
  setActivePage,
  children,
  onLogout,
  error,
  notice
}) {
  return (
    <main className="cool-dash-shell">
      <aside className="cool-dash-sidebar">
        <div className="cool-dash-brand">
          <div className="cool-dash-brand-logo">
            <svg width="28" height="28" viewBox="0 0 42 42" fill="none">
              <rect width="42" height="42" rx="12" fill="url(#dbLogo)" />
              <path d="M12 28V14l9 7-9 7z" fill="rgba(255,255,255,0.95)" />
              <path d="M21 21l9-7v14l-9-7z" fill="rgba(255,255,255,0.5)" />
              <defs>
                <linearGradient id="dbLogo" x1="0" y1="0" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <span>EduVista</span>
          </div>
          <h1>{profile?.role === "university" ? profile.universityName || profile.name : profile?.name}</h1>
          <div className="cool-dash-brand-role">
            {profile?.role === "university" ? "Institution" : profile?.role}
          </div>
        </div>

        <nav className="cool-dash-nav">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={`cool-dash-nav-link ${activePage === page.id ? "active" : ""}`}
              onClick={() => setActivePage(page.id)}
            >
              <div className="cool-dash-nav-icon">{page.icon || "📄"}</div>
              <div className="cool-dash-nav-label">
                <span>{page.label}</span>
                <small>{page.note}</small>
              </div>
            </button>
          ))}
        </nav>

        <div className="cool-dash-sidebar-footer">
          <button type="button" className="cool-dash-logout" onClick={onLogout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      <div className="cool-dash-main">
        <header className="cool-dash-header">
          <div className="cool-dash-header-top">
            <div>
              <div className="cool-dash-header-kicker">
                {profile?.role === "university" ? "Institution Workspace" : "Dashboard"}
              </div>
              <h1>{pages.find((page) => page.id === activePage)?.label}</h1>
              <div className="cool-dash-header-meta">
                {profile?.role === "student"
                  ? `Academic level: ${profile?.academicLevel || "Not set"}`
                  : `Department: ${profile?.departmentName || "Not set"}`}
                <span className="cool-dash-header-badge">{profile?.role || "user"}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Toast notifications */}
        <div className="cool-toast-container">
          {error ? (
            <div className="cool-toast error">
              <div className="cool-toast-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="cool-toast success">
              <div className="cool-toast-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              {notice}
            </div>
          ) : null}
        </div>

        <div className="page-grid">{children}</div>
      </div>
    </main>
  );
}

function StudentDashboard({
  token,
  profile,
  onError,
  onNotice,
  onLogout,
  error,
  notice,
  onProfileUpdate
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState("discover");
  const [loading, setLoading] = useState(true);
  const [studentProfile, setStudentProfile] = useState(null);
  const [studentDocuments, setStudentDocuments] = useState([]);
  const [meta, setMeta] = useState({
    states: [],
    cities: [],
    categories: [],
    universities: []
  });
  const [filters, setFilters] = useState({
    q: "",
    state: "",
    city: "",
    category: "",
    universityId: ""
  });
  const [catalog, setCatalog] = useState([]);
  const [applications, setApplications] = useState([]);
  const [applicationDetail, setApplicationDetail] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [notifications, setNotifications] = useState({
    summary: { unread: 0 },
    notifications: []
  });
  const [applicationDraft, setApplicationDraft] = useState({
    courseId: null,
    statement: ""
  });
  const [documentDraft, setDocumentDraft] = useState({
    requirementName: "",
    file: null
  });

  const pages = [
    { id: "discover", label: "Course Suggestions", note: "Browse recommended colleges and courses", icon: "🔍" },
    { id: "applications", label: "Applications", note: "Track status and upload requested files", icon: "📋" },
    { id: "profile", label: "Profile Record", note: "Academic details stored in the database", icon: "👤" }
  ];

  const refresh = async () => {
    setLoading(true);
    try {
      const [
        meResult,
        profileResult,
        appMeta,
        catalogResult,
        myApps,
        announcementResult,
        notificationResult
      ] = await Promise.all([
        api.me(token),
        api.profile(token),
        api.applicationMeta(token),
        api.applicationCatalog(token, filters),
        api.myCourseApplications(token),
        api.announcements(token),
        api.notifications(token)
      ]);

      onProfileUpdate(meResult.user);
      setStudentProfile(profileResult.profile || null);
      setStudentDocuments(profileResult.documents || []);
      setMeta(appMeta);
      setCatalog(catalogResult.catalog || []);
      setApplications(myApps.applications || []);
      setAnnouncements(announcementResult.announcements || []);
      setNotifications(notificationResult);
    } catch (requestError) {
      onError(toMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const result = await api.applicationCatalog(token, filters);
        setCatalog(result.catalog || []);
      } catch (requestError) {
        onError(toMessage(requestError));
      }
    };

    loadCatalog();
  }, [filters, token, onError]);

  const stats = [
    { label: "Suggested Courses", value: catalog.length, note: "Matching current filters" },
    {
      label: "Strong Matches",
      value: catalog.filter((course) => course.is_eligible && course.recommendation_score >= 75).length,
      note: "Eligible courses with a high recommendation score"
    },
    { label: "Applications", value: applications.length, note: "Submitted course applications" },
    {
      label: "Unread Alerts",
      value: notifications.summary?.unread || 0,
      note: "System and university messages"
    }
  ];

  const loadApplicationDetail = async (applicationId) => {
    try {
      const result = await api.applicationDetails(token, applicationId);
      setApplicationDetail(result);
      const firstMissingRequirement =
        result.requirements?.find((item) => !Number(item.uploaded))?.document_name || "";
      setDocumentDraft({
        requirementName: firstMissingRequirement,
        file: null
      });
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  const submitApplication = async (courseId) => {
    try {
      const result = await api.submitApplication(token, {
        courseId,
        statement: applicationDraft.courseId === courseId ? applicationDraft.statement : ""
      });
      onNotice(result.message || "Application submitted.");
      setApplicationDraft({ courseId: null, statement: "" });
      if (result.applicationId) {
        await loadApplicationDetail(result.applicationId);
      }
      await refresh();
      setPage("applications");
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  const uploadApplicationDocument = async (event) => {
    event.preventDefault();
    if (!applicationDetail?.application?.id || !documentDraft.file) {
      onError("Select an application and file first.");
      return;
    }

    if (applicationDetail.requirements?.length && !documentDraft.requirementName) {
      onError("Choose the matching requirement before uploading.");
      return;
    }

    try {
      await api.uploadApplicationDocument(token, applicationDetail.application.id, {
        requirementName: documentDraft.requirementName || "Supporting Document",
        file: documentDraft.file
      });
      onNotice("Application document uploaded.");
      await loadApplicationDetail(applicationDetail.application.id);
      await refresh();
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  if (loading) {
    return <p className="loading-copy">Loading student workspace...</p>;
  }

  return (
    <DashboardShell
      profile={profile}
      pages={pages}
      activePage={page}
      setActivePage={setPage}
      onLogout={onLogout}
      error={error}
      notice={notice}
    >


      {page === "discover" ? (
        <>
          <Panel title="Course Suggestions" note="Search colleges and courses that fit your current profile.">
            <div className="filter-bar">
              <input
                placeholder="Search college, course, or qualification"
                value={filters.q}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, q: event.target.value }))
                }
              />
              <select
                value={filters.state}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, state: event.target.value }))
                }
              >
                <option value="">All states</option>
                {meta.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <select
                value={filters.city}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, city: event.target.value }))
                }
              >
                <option value="">All cities</option>
                {meta.cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <select
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, category: event.target.value }))
                }
              >
                <option value="">All categories</option>
                {meta.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={filters.universityId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, universityId: event.target.value }))
                }
              >
                <option value="">All universities</option>
                {meta.universities.map((university) => (
                  <option key={university.id} value={university.id}>
                    {university.university_name}
                  </option>
                ))}
              </select>
            </div>
          </Panel>

          <section className="catalog-grid">
            {catalog.length === 0 ? <EmptyState copy="No courses match the current filters." /> : null}
            {catalog.map((course) => (
              <article key={course.id} className="catalog-card">
                <div className="catalog-card-head">
                  <span className="catalog-badge">{course.category}</span>
                  <div className="row-actions">
                    <StatusPill
                      status={course.application_status || (course.is_closed ? "closed" : "open")}
                    />
                    <StatusPill status={course.is_eligible ? "eligible" : "ineligible"} />
                    <StatusPill status={course.recommendation_band || "low"} />
                  </div>
                </div>
                <h3>{course.title}</h3>
                <p className="catalog-school">{course.university_name}</p>
                <p className="catalog-meta">
                  {course.location_city}, {course.location_state} | {course.duration_label}
                </p>
                <p className="catalog-meta">Mode: {formatDeliveryMode(course.delivery_mode)}</p>
                <p>{course.description || "Admissions listing ready for student applications."}</p>
                <ul className="meta-list">
                  <li>Qualification: {course.qualification_required}</li>
                  <li>Eligibility: {formatEligibilityLabel(course)}</li>
                  <li>Fee: {course.approx_fee_total || "Contact university"}</li>
                  <li>Deadline: {formatDate(course.application_deadline)}</li>
                  <li>Required documents: {course.requirement_count}</li>
                </ul>
                <div className="info-block">
                  <strong>Student application note</strong>
                  <p>{course.application_bar_label || "Upload required files and apply."}</p>
                </div>
                <div className="info-block">
                  <strong>Smart match score</strong>
                  <p>{course.recommendation_score || 0}/100</p>
                  {course.recommendation_reasons?.length ? (
                    <small>{course.recommendation_reasons.join(" ")}</small>
                  ) : null}
                </div>
                {!course.is_eligible ? (
                  <div className="info-block">
                    <strong>Eligibility status</strong>
                    <p>{course.eligibility_reason || "Update your profile to check eligibility."}</p>
                  </div>
                ) : null}
                {applicationDraft.courseId === course.id ? (
                  <div className="stack top-gap">
                    <textarea
                      rows={3}
                      placeholder="Why are you interested in this course?"
                      value={applicationDraft.statement}
                      onChange={(event) =>
                        setApplicationDraft((current) => ({
                          ...current,
                          statement: event.target.value
                        }))
                      }
                    />
                    <div className="row-actions">
                      <button type="button" onClick={() => submitApplication(course.id)}>
                        Submit Application
                      </button>
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => setApplicationDraft({ courseId: null, statement: "" })}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row-actions top-gap">
                    {course.application_id ? (
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={async () => {
                          await loadApplicationDetail(course.application_id);
                          setPage("applications");
                        }}
                      >
                        Open Application
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(course.is_closed || !course.is_eligible)}
                        onClick={() =>
                          setApplicationDraft({
                            courseId: course.id,
                            statement: ""
                          })
                        }
                      >
                        {course.is_closed
                          ? "Deadline Passed"
                          : course.is_eligible
                            ? "Apply Now"
                            : "Not Eligible"}
                      </button>
                    )}
                    {course.brochure_path ? (
                      <a
                        className="text-link"
                        href={toAssetUrl(course.brochure_path)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Brochure
                      </a>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      ) : null}

      {page === "applications" ? (
        <>
          <Panel title="My Applications" note="Track application status and manage requested uploads.">
            {applications.length === 0 ? (
              <EmptyState copy="You have not submitted any applications yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>University</th>
                      <th>Status</th>
                      <th>Fit Score</th>
                      <th>Documents</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((item) => (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td>{item.university_name}</td>
                        <td>
                          <StatusPill status={item.status} />
                        </td>
                        <td>{item.fit_score || "-"}</td>
                        <td>{item.document_count}</td>
                        <td>
                          <button
                            type="button"
                            className="outline-btn"
                            onClick={() => loadApplicationDetail(item.id)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Application Detail" note="Upload any missing documents requested by the course.">
            {!applicationDetail?.application ? (
              <EmptyState copy="Open an application to inspect its requirements." />
            ) : (
              <div className="stack">
                <div className="detail-card">
                  <h3>{applicationDetail.application.title}</h3>
                  <p>{applicationDetail.application.university_name}</p>
                  <p>
                    Status: <StatusPill status={applicationDetail.application.status} /> | Fit
                    score: {applicationDetail.application.fit_score || "-"}
                  </p>
                  <p>Deadline: {formatDate(applicationDetail.application.application_deadline)}</p>
                </div>

                <form className="upload-strip" onSubmit={uploadApplicationDocument}>
                  {applicationDetail.requirements?.length ? (
                    <select
                      value={documentDraft.requirementName}
                      onChange={(event) =>
                        setDocumentDraft((current) => ({
                          ...current,
                          requirementName: event.target.value
                        }))
                      }
                    >
                      <option value="">Select requirement</option>
                      {applicationDetail.requirements.map((requirement) => (
                        <option key={requirement.id} value={requirement.document_name}>
                          {requirement.document_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      placeholder="Requirement name"
                      value={documentDraft.requirementName}
                      onChange={(event) =>
                        setDocumentDraft((current) => ({
                          ...current,
                          requirementName: event.target.value
                        }))
                      }
                    />
                  )}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) =>
                      setDocumentDraft((current) => ({
                        ...current,
                        file: event.target.files?.[0] || null
                      }))
                    }
                  />
                  <button type="submit">Upload</button>
                </form>

                {applicationDetail.requirements?.length ? (
                  <div className="split-grid">
                    {applicationDetail.requirements.map((requirement) => (
                      <div key={requirement.id} className="check-card">
                        <StatusPill
                          status={Number(requirement.uploaded) ? "ready" : "incomplete"}
                        />
                        <strong>{requirement.document_name}</strong>
                        <small>{requirement.instructions || "No instructions provided."}</small>
                      </div>
                    ))}
                  </div>
                ) : null}

                {applicationDetail.documents.length === 0 ? (
                  <EmptyState copy="No uploaded application documents yet." />
                ) : (
                  <ul className="document-list">
                    {applicationDetail.documents.map((doc) => (
                      <li key={doc.id}>
                        <div>
                          <strong>{doc.requirement_name}</strong>
                          <span>{doc.original_name}</span>
                        </div>
                        <div className="row-actions">
                          <a
                            className="text-link"
                            href={toAssetUrl(doc.file_path)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            className="outline-btn"
                            onClick={async () => {
                              try {
                                await api.deleteApplicationDocument(token, doc.id);
                                onNotice("Application document removed.");
                                await loadApplicationDetail(applicationDetail.application.id);
                                await refresh();
                              } catch (requestError) {
                                onError(toMessage(requestError));
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {page === "profile" ? (
        <>
          <Panel
            title="Stored Student Profile"
            note="These are the academic details and documents currently stored for your account."
            actions={
              <button type="button" onClick={() => navigate("/profile-setup")}>
                Edit Profile Setup
              </button>
            }
          >
            <div className="split-grid">
              <div className="detail-card">
                <h3>{studentProfile?.full_name || profile.name}</h3>
                <p>Academic level: {studentProfile?.academic_level || "-"}</p>
                <p>Phone: {studentProfile?.phone || "-"}</p>
                <p>Parent phone: {studentProfile?.guardian_phone || "-"}</p>
                <p>City / State: {studentProfile?.city || "-"} / {studentProfile?.state || "-"}</p>
              </div>
              <div className="detail-card">
                <h3>Academic record</h3>
                <p>Board: {studentProfile?.board_name || "-"}</p>
                <p>School: {studentProfile?.school_name || "-"}</p>
                <p>Stream: {studentProfile?.stream_name || "-"}</p>
                <p>Score: {studentProfile?.score_percent || "-"}%</p>
                <p>Target course: {studentProfile?.target_course || "-"}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Stored Documents" note="Documents uploaded during student profile setup.">
            {studentDocuments.length === 0 ? (
              <EmptyState copy="No profile documents uploaded yet." />
            ) : (
              <ul className="document-list">
                {studentDocuments.map((document) => (
                  <li key={document.id}>
                    <div>
                      <strong>{document.document_type.replace(/_/g, " ")}</strong>
                      <span>{document.original_name}</span>
                    </div>
                    <a
                      className="text-link"
                      href={toAssetUrl(document.file_path)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </DashboardShell>
  );
}

function UniversityDashboard({
  token,
  profile,
  onError,
  onNotice,
  onLogout,
  error,
  notice,
  onProfileUpdate
}) {
  const [page, setPage] = useState("applications");
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
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
  const [courses, setCourses] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [applications, setApplications] = useState([]);
  const [applicationDetail, setApplicationDetail] = useState(null);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseForm, setCourseForm] = useState({
    code: "",
    title: "",
    category: "Technology",
    deliveryMode: "offline",
    description: "",
    credits: "4",
    seatsTotal: "40",
    scheduleBlock: "Mon/Wed 09:00-10:30",
    departmentId: "",
    semesterId: "",
    locationState: "",
    locationCity: "",
    durationLabel: "4 Years",
    qualificationRequired: "",
    eligibleAcademicLevels: "10,12",
    minimumScorePercent: "",
    approxFeeTotal: "",
    applicationDeadline: "",
    brochurePath: "",
    requiredDocumentsIntro: "",
    requirements: []
  });
  const [draftRequirement, setDraftRequirement] = useState({
    documentName: "",
    instructions: "",
    isRequired: true
  });
  const [requirementForm, setRequirementForm] = useState({
    documentName: "",
    instructions: "",
    isRequired: true
  });

  const buildEmptyCourseForm = (state = profileForm.state || "", city = profileForm.city || "") => ({
    code: "",
    title: "",
    category: "Technology",
    deliveryMode: "offline",
    description: "",
    credits: "4",
    seatsTotal: "40",
    scheduleBlock: "Mon/Wed 09:00-10:30",
    departmentId: "",
    semesterId: "",
    locationState: state,
    locationCity: city,
    durationLabel: "4 Years",
    qualificationRequired: "",
    eligibleAcademicLevels: "10,12",
    minimumScorePercent: "",
    approxFeeTotal: "",
    applicationDeadline: "",
    brochurePath: "",
    requiredDocumentsIntro: "",
    requirements: []
  });
  const courseUploadWarnings = useMemo(
    () => buildCourseUploadWarnings(courseForm, profileForm),
    [courseForm, profileForm]
  );
  const courseSuggestionGroups = useMemo(
    () => buildCourseSuggestionGroups(courseForm.eligibleAcademicLevels, courseForm.title),
    [courseForm.eligibleAcademicLevels, courseForm.title]
  );
  const courseSuggestionOptions = useMemo(
    () => buildAllCourseSuggestionOptions(courseForm.eligibleAcademicLevels),
    [courseForm.eligibleAcademicLevels]
  );
  const coursePreviewRow = {
    category: courseForm.category || "-",
    mode: formatDeliveryMode(courseForm.deliveryMode),
    collegeName: profileForm.universityName || profile.universityName || "-",
    state: courseForm.locationState || profileForm.state || "-",
    city: courseForm.locationCity || profileForm.city || "-",
    course: courseForm.title || "-",
    duration: courseForm.durationLabel || "-",
    qualification: courseForm.qualificationRequired || "-",
    fee: courseForm.approxFeeTotal || "-",
    grades: formatEligibleAcademicLevels(courseForm.eligibleAcademicLevels)
  };
  const canPublishCourses = Boolean((profileForm.universityName || profile.universityName || "").trim());

  const pages = [
    { id: "applications", label: "Review Applications", note: "Shortlist and decide applicants", icon: "📋" },
    { id: "publish", label: "Publish Courses", note: "Create new course listings", icon: "🚀" },
    { id: "courses", label: "Courses", note: "Manage published courses", icon: "📚" }
  ];

  const refresh = async () => {
    setLoading(true);
    try {
      const [profileResult, meResult, courseResult, applicationResult] =
        await Promise.all([
          api.profile(token),
          api.me(token),
          api.universityCourses(token),
          api.universityApplications(token)
        ]);

      onProfileUpdate(meResult.user);
      setCourses(courseResult.courses || []);
      setApplications(applicationResult.applications || []);
      setProfileForm({
        fullName: profileResult.profile?.full_name || meResult.user.name || "",
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
        logoPath: profileResult.profile?.logo_path || "",
        bannerPath: profileResult.profile?.banner_path || "",
        applicationBarLabel: profileResult.profile?.application_bar_label || ""
      });
    } catch (requestError) {
      onError(toMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editingCourseId) {
      return;
    }

    setCourseForm((current) => ({
      ...current,
      locationState: current.locationState || profileForm.state || "",
      locationCity: current.locationCity || profileForm.city || ""
    }));
  }, [editingCourseId, profileForm.city, profileForm.state]);

  const loadRequirements = async (courseId) => {
    try {
      const result = await api.courseRequirements(token, courseId);
      setSelectedCourseId(courseId);
      setRequirements(result.requirements || []);
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  const loadApplicationDetail = async (applicationId) => {
    try {
      const result = await api.applicationDetails(token, applicationId);
      setApplicationDetail(result);
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      await api.updateProfile(token, profileForm);
      onNotice("University profile updated.");
      await refresh();
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  const applySuggestedCourse = (title, suggestedLevel) => {
    setCourseForm((current) => ({
      ...current,
      title,
      eligibleAcademicLevels:
        current.eligibleAcademicLevels === "10,12" ? suggestedLevel : current.eligibleAcademicLevels
    }));
  };

  const saveCourse = async (event) => {
    event.preventDefault();

    if (!canPublishCourses) {
      onError("Set the college name in the University Profile before publishing courses.");
      return;
    }

    try {
      const payload = {
        ...courseForm,
        category: courseForm.category || "Technology",
        deliveryMode: courseForm.deliveryMode || "offline",
        locationState: courseForm.locationState || profileForm.state || "",
        locationCity: courseForm.locationCity || profileForm.city || "",
        credits: Number(courseForm.credits),
        seatsTotal: Number(courseForm.seatsTotal),
        departmentId: courseForm.departmentId ? Number(courseForm.departmentId) : null,
        minimumScorePercent:
          courseForm.minimumScorePercent === ""
            ? null
            : Number(courseForm.minimumScorePercent)
      };

      if (editingCourseId) {
        await api.updateUniversityCourse(token, editingCourseId, payload);
        onNotice("✅ Course updated successfully and saved to database!");
      } else {
        await api.createUniversityCourse(token, payload);
        onNotice("✅ Course published successfully! It's now saved in the database and visible to students.");
      }

      setEditingCourseId(null);
      setCourseForm(buildEmptyCourseForm());
      await refresh();
      setPage("courses");
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  const addRequirement = async (event) => {
    event.preventDefault();
    if (!selectedCourseId) {
      onError("Select a course first.");
      return;
    }

    try {
      await api.addCourseRequirement(token, selectedCourseId, requirementForm);
      onNotice("Requirement added.");
      setRequirementForm({ documentName: "", instructions: "", isRequired: true });
      await loadRequirements(selectedCourseId);
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  if (loading) {
    return <p className="loading-copy">Loading university workspace...</p>;
  }

  return (
    <DashboardShell
      profile={profile}
      pages={pages}
      activePage={page}
      setActivePage={setPage}
      onLogout={onLogout}
      error={error}
      notice={notice}
    >
      {page === "publish" ? (
        <>
          <div className="cool-dash-panel">
            <div className="cool-dash-panel-head">
              <div>
                <h2>{editingCourseId ? "Edit Course" : "Publish Course"}</h2>
                <p className="cool-dash-panel-note">Fill in the details and publish your course listing.</p>
              </div>
              {editingCourseId ? (
                <div className="cool-dash-panel-actions">
                  <button
                    type="button"
                    className="cool-dash-btn-sm edit"
                    onClick={() => {
                      setEditingCourseId(null);
                      setCourseForm(buildEmptyCourseForm());
                    }}
                  >
                    Cancel Edit
                  </button>
                </div>
              ) : null}
            </div>

            <form className="cool-dash-form" onSubmit={saveCourse}>
              <div className="cool-dash-info-banner">
                <div className="cool-dash-info-banner-icon">📊</div>
                <div>
                  <h4>Dataset-aligned course upload</h4>
                  <p>
                    Publish one clean admissions row at a time: Category, Course Mode, College Name,
                    State, City/Location, Course, Duration, Qualification Required, and Approx Fee (Total).
                  </p>
                </div>
              </div>

              {courseUploadWarnings.length ? (
                <div className="cool-dash-warning">
                  ⚠️ {courseUploadWarnings.join(" ")}
                </div>
              ) : null}

              {!canPublishCourses ? (
                <div className="cool-dash-warning">
                  ⚠️ Save the institution name in the University Profile tab before publishing courses.
                </div>
              ) : null}

              <div className="cool-dash-form-group">
                <label>Category</label>
                <div className="cool-dash-cat-pills">
                  {COURSE_CATEGORY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`cool-dash-cat-pill ${courseForm.category === option ? "active" : ""}`}
                      onClick={() =>
                        setCourseForm((current) => ({ ...current, category: option }))
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>Type of course</label>
                  <div className="cool-dash-mode-toggle">
                    {COURSE_DELIVERY_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`cool-dash-mode-btn ${courseForm.deliveryMode === option.value ? "active" : ""}`}
                        onClick={() =>
                          setCourseForm((current) => ({
                            ...current,
                            deliveryMode: option.value
                          }))
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="cool-dash-form-group">
                  <label>Who can apply</label>
                  <select
                    value={courseForm.eligibleAcademicLevels}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        eligibleAcademicLevels: event.target.value
                      }))
                    }
                  >
                    <option value="10">After Class 10</option>
                    <option value="12">After Class 12</option>
                    <option value="10,12">Both 10th and 12th</option>
                  </select>
                </div>
              </div>

              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>College Name / Institution</label>
                  <input value={profileForm.universityName || profile.universityName || ""} readOnly style={{ opacity: 0.6 }} />
                </div>
                <div className="cool-dash-form-group">
                  <label>State</label>
                  <input
                    value={courseForm.locationState}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        locationState: event.target.value
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>City / Location</label>
                  <input
                    value={courseForm.locationCity}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        locationCity: event.target.value
                      }))
                    }
                    required
                  />
                </div>
                <div className="cool-dash-form-group">
                  <label>Course name</label>
                  <input
                    list="university-course-name-options"
                    value={courseForm.title}
                    onChange={(event) =>
                      setCourseForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Start typing to pick from options"
                    required
                  />
                </div>
              </div>

              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>Duration of course</label>
                  <input
                    value={courseForm.durationLabel}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        durationLabel: event.target.value
                      }))
                    }
                    placeholder="4 Years, 3 Years, 5 Years..."
                    required
                  />
                </div>
                <div className="cool-dash-form-group">
                  <label>Qualification Required</label>
                  <input
                    value={courseForm.qualificationRequired}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        qualificationRequired: event.target.value
                      }))
                    }
                    placeholder="10+2 PCM 50%, KEAM"
                    required
                  />
                </div>
              </div>

              <div className="cool-dash-form-group">
                <label>Approx Fee (Total)</label>
                <input
                  value={courseForm.approxFeeTotal}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      approxFeeTotal: event.target.value
                    }))
                  }
                  placeholder="INR 2.8 Lakh total"
                  required
                />
              </div>

              <datalist id="university-course-name-options">
                {courseSuggestionOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>

              {/* Suggested course names */}
              <div className="cool-dash-form-group">
                <label>Suggested course names</label>
                <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.5rem" }}>
                  Click a suggestion to autofill the course name.
                </p>
                {courseSuggestionGroups.length === 0 ? (
                  <p style={{ fontSize: "0.85rem", color: "#475569", fontStyle: "italic" }}>No suggestions match the current filter.</p>
                ) : (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {courseSuggestionGroups.map((group) => (
                      <div key={group.label}>
                        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#818cf8", marginBottom: "0.4rem" }}>
                          {group.label} — {group.total} matches
                        </p>
                        <div className="cool-dash-cat-pills">
                          {group.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={`cool-dash-cat-pill ${courseForm.title === option ? "active" : ""}`}
                              onClick={() => applySuggestedCourse(option, group.level)}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Required Documents */}
              <div className="cool-dash-form-group">
                <label>Required Documents</label>
                <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.5rem" }}>
                  Define what students must upload per course.
                </p>
                <div className="cool-dash-cat-pills" style={{ marginBottom: "0.75rem" }}>
                  {["10th Marksheet", "12th Marksheet", "Certificate", "Entrance Exam Score", "ID Proof", "Statement of Purpose"].map((doc) => (
                    <button
                      key={doc}
                      type="button"
                      className="cool-dash-cat-pill"
                      onClick={() => {
                        if (!courseForm.requirements.some((r) => r.documentName === doc)) {
                          setCourseForm((current) => ({
                            ...current,
                            requirements: [...current.requirements, { documentName: doc, instructions: "", isRequired: true }]
                          }));
                        }
                      }}
                    >
                      + {doc}
                    </button>
                  ))}
                </div>

                <div className="cool-dash-form-row" style={{ alignItems: "flex-end" }}>
                  <div className="cool-dash-form-group">
                    <input
                      placeholder="Custom document name"
                      value={draftRequirement.documentName}
                      onChange={(event) =>
                        setDraftRequirement((current) => ({
                          ...current,
                          documentName: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="cool-dash-form-group">
                    <input
                      placeholder="Instructions (optional)"
                      value={draftRequirement.instructions}
                      onChange={(event) =>
                        setDraftRequirement((current) => ({
                          ...current,
                          instructions: event.target.value
                        }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="cool-dash-btn-sm edit"
                    style={{ padding: "0.75rem 1.2rem", whiteSpace: "nowrap" }}
                    onClick={() => {
                      if (!draftRequirement.documentName) return;
                      setCourseForm((current) => ({
                        ...current,
                        requirements: [...current.requirements, { ...draftRequirement }]
                      }));
                      setDraftRequirement({ documentName: "", instructions: "", isRequired: true });
                    }}
                  >
                    Add Custom
                  </button>
                </div>

                {courseForm.requirements.length > 0 && (
                  <ul className="cool-dash-req-list" style={{ marginTop: "0.75rem" }}>
                    {courseForm.requirements.map((req, index) => (
                      <li key={index} className="cool-dash-req-item">
                        <div>
                          <strong style={{ color: "#e2e8f0", fontFamily: "Manrope, sans-serif", fontSize: "0.85rem" }}>{req.documentName}</strong>
                          <small style={{ color: "#64748b", display: "block", marginTop: "0.1rem" }}>{req.instructions || "No instructions"}</small>
                        </div>
                        <button
                          type="button"
                          className="cool-dash-btn-sm delete"
                          onClick={() => {
                            setCourseForm((current) => ({
                              ...current,
                              requirements: current.requirements.filter((_, i) => i !== index)
                            }));
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button type="submit" className="cool-dash-submit" disabled={!canPublishCourses}>
                {editingCourseId ? "Save Changes" : "🚀 Publish Course"}
              </button>
            </form>
          </div>
        </>
      ) : null}

      {page === "courses" ? (
        <div className="cool-dash-panel">
          <div className="cool-dash-panel-head">
            <div>
              <h2>Published Courses</h2>
              <p className="cool-dash-panel-note">Courses uploaded by your institution</p>
            </div>
          </div>
          {courses.length === 0 ? (
            <div className="cool-dash-empty">
              <div className="cool-dash-empty-icon">📚</div>
              <h3>No courses published yet</h3>
              <p>Head to the Publish tab to create your first course listing.</p>
            </div>
          ) : (
            <div className="cool-dash-table-wrap">
              <table className="cool-dash-table">
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Category</th>
                    <th>Mode</th>
                    <th>Course</th>
                    <th>State</th>
                    <th>City</th>
                    <th>Duration</th>
                    <th>Qualification</th>
                    <th>Eligibility</th>
                    <th>Fee</th>
                    <th>Apps</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => (
                    <tr key={course.id}>
                      <td>
                        <strong style={{ color: "#e2e8f0", fontFamily: "Manrope, sans-serif" }}>{course.university_name || "-"}</strong>
                        <br />
                        <span style={{ fontSize: "0.78em", color: "#64748b" }}>{course.institution_email || "-"}</span>
                      </td>
                      <td><span className="cool-dash-pill muted">{course.category || "-"}</span></td>
                      <td>{formatDeliveryMode(course.delivery_mode)}</td>
                      <td>
                        <strong style={{ color: "#f1f5f9", fontFamily: "Manrope, sans-serif" }}>{course.title}</strong>
                        <br />
                        <span style={{ fontSize: "0.78em", color: "#818cf8" }}>{course.code}</span>
                      </td>
                      <td>{course.location_state || "-"}</td>
                      <td>{course.location_city || "-"}</td>
                      <td>{course.duration_label || "-"}</td>
                      <td>{course.qualification_required}</td>
                      <td>
                        {formatEligibleAcademicLevels(course.eligible_academic_levels)}
                        {course.minimum_score_percent ? ` | ${course.minimum_score_percent}%+` : ""}
                      </td>
                      <td>{course.approx_fee_total || "-"}</td>
                      <td>{course.application_count || 0}</td>
                      <td>
                        <div className="cool-dash-row-actions">{/* Edit */}
                          <button
                            type="button"
                            className="cool-dash-btn-sm edit"
                            onClick={async () => {
                              setPage("publish");
                              setEditingCourseId(course.id);
                                
                                let existingReqs = [];
                                try {
                                  const reqResult = await api.courseRequirements(token, course.id);
                                  existingReqs = reqResult.requirements || [];
                                } catch (e) {
                                  console.error("Failed to load requirements", e);
                                }

                                setCourseForm({
                                  code: course.code || "",
                                  title: course.title || "",
                                  category: course.category || "Technology",
                                  deliveryMode: course.delivery_mode || "offline",
                                  description: course.description || "",
                                  credits: String(course.credits || 4),
                                  seatsTotal: String(course.seats_total || 40),
                                  scheduleBlock: course.schedule_block || "Mon/Wed 09:00-10:30",
                                  departmentId: String(course.department_id || ""),
                                  semesterId: String(course.semester_id || ""),
                                  locationState: course.location_state || "",
                                  locationCity: course.location_city || "",
                                  durationLabel: course.duration_label || "4 Years",
                                  qualificationRequired: course.qualification_required || "",
                                  eligibleAcademicLevels:
                                    course.eligible_academic_levels || "10,12",
                                  minimumScorePercent:
                                    course.minimum_score_percent === null ||
                                    course.minimum_score_percent === undefined
                                      ? ""
                                      : String(course.minimum_score_percent),
                                  approxFeeTotal: course.approx_fee_total || "",
                                  applicationDeadline: course.application_deadline
                                    ? String(course.application_deadline).slice(0, 10)
                                    : "",
                                  brochurePath: course.brochure_path || "",
                                  requiredDocumentsIntro: course.required_documents_intro || "",
                                  requirements: existingReqs.map(r => ({ documentName: r.document_name, instructions: r.instructions, isRequired: Boolean(r.is_required) }))
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="cool-dash-btn-sm delete"
                              onClick={async () => {
                                try {
                                  await api.deleteUniversityCourse(token, course.id);
                                  onNotice("Course deleted.");
                                  await refresh();
                                } catch (requestError) {
                                  onError(toMessage(requestError));
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

      {page === "applications" ? (
        <>
          <Panel title="Application Review" note="Review fit scores, inspect documents, and update status.">
            {applications.length === 0 ? (
              <EmptyState copy="No incoming applications." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Status</th>
                      <th>Docs</th>
                      <th>Fit Score</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((item) => (
                      <tr key={item.id}>
                        <td>{item.student_name}</td>
                        <td>{item.title}</td>
                        <td><StatusPill status={item.status} /></td>
                        <td>{item.document_count}</td>
                        <td>{item.fit_score || "-"}</td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="outline-btn" onClick={() => loadApplicationDetail(item.id)}>
                              Inspect
                            </button>
                            <select
                              value=""
                              onChange={async (event) => {
                                const nextStatus = event.target.value;
                                if (!nextStatus) {
                                  return;
                                }
                                try {
                                  await api.reviewUniversityApplication(token, item.id, nextStatus);
                                  onNotice("Application status updated.");
                                  await refresh();
                                  await loadApplicationDetail(item.id);
                                } catch (requestError) {
                                  onError(toMessage(requestError));
                                }
                              }}
                            >
                              <option value="">Set status</option>
                              <option value="under_review">Under review</option>
                              <option value="shortlisted">Shortlisted</option>
                              <option value="accepted">Accepted</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Application Detail" note="Inspect submitted files before making a decision.">
            {!applicationDetail?.application ? (
              <EmptyState copy="Open an application from the table above." />
            ) : (
              <div className="stack">
                <div className="detail-card">
                  <h3>{applicationDetail.application.title}</h3>
                  <p>{applicationDetail.application.university_name}</p>
                  <p>
                    Applied: {formatDateTime(applicationDetail.application.applied_at)} |{" "}
                    <StatusPill status={applicationDetail.application.status} />
                  </p>
                  <p>{applicationDetail.application.statement || "No statement submitted."}</p>
                </div>
                <div className="split-grid">
                  <div className="detail-card">
                    <h3>{applicationDetail.application.student_name}</h3>
                    <p>{applicationDetail.application.student_email}</p>
                    <p>
                      Year {applicationDetail.application.year_level || "-"} | CGPA{" "}
                      {applicationDetail.application.cgpa || "-"}
                    </p>
                    <p>
                      {applicationDetail.application.student_city || "-"},{" "}
                      {applicationDetail.application.student_state || "-"}
                    </p>
                  </div>
                  <div className="detail-card">
                    <h3>Academic summary</h3>
                    <p>{applicationDetail.application.school_name || "School not added."}</p>
                    <p>{applicationDetail.application.marks_summary || "No marks summary."}</p>
                    <p>{applicationDetail.application.bio || "No student bio submitted."}</p>
                  </div>
                </div>
                {applicationDetail.requirements?.length ? (
                  <div className="split-grid">
                    {applicationDetail.requirements.map((requirement) => (
                      <div key={requirement.id} className="check-card">
                        <StatusPill status={Number(requirement.uploaded) ? "ready" : "incomplete"} />
                        <strong>{requirement.document_name}</strong>
                        <small>{requirement.instructions || "No instructions provided."}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
                {applicationDetail.documents.length === 0 ? (
                  <EmptyState copy="No documents uploaded yet." />
                ) : (
                  <ul className="document-list">
                    {applicationDetail.documents.map((doc) => (
                      <li key={doc.id}>
                        <div>
                          <strong>{doc.requirement_name}</strong>
                          <span>{doc.original_name}</span>
                        </div>
                        <a className="text-link" href={toAssetUrl(doc.file_path)} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </DashboardShell>
  );
}

function AdminDashboard({ token, profile, onError, onNotice, onLogout, error, notice }) {
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({});
  const [students, setStudents] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [applicationQueue, setApplicationQueue] = useState([]);
  const [departmentReport, setDepartmentReport] = useState([]);
  const [popularCourses, setPopularCourses] = useState([]);
  const [trends, setTrends] = useState([]);
  const [announcementHistory, setAnnouncementHistory] = useState([]);
  const [freezeInfo, setFreezeInfo] = useState({ frozen: false });
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    targetRole: "all"
  });

  const pages = [
    { id: "overview", label: "Overview", note: "Users, notices, and current system state", icon: "📊" },
    { id: "accounts", label: "Accounts", note: "Students and universities", icon: "👥" },
    { id: "catalog", label: "Catalog", note: "Admissions inventory across universities", icon: "📚" },
    { id: "analytics", label: "Analytics", note: "Reports, demand, and trends", icon: "📈" },
    { id: "system", label: "System Controls", note: "Freeze state and announcements", icon: "⚙️" }
  ];

  const refresh = async () => {
    setLoading(true);
    try {
      const [
        overviewResult,
        studentResult,
        universityResult,
        freezeResult,
        catalogResult,
        applicationResult,
        departmentsResult,
        popularResult,
        trendsResult,
        announcementsResult
      ] = await Promise.all([
        api.analyticsOverview(token),
        api.adminUsers(token, { role: "student" }),
        api.adminUsers(token, { role: "university" }),
        api.freezeStatus(token),
        api.adminCourses(token),
        api.universityApplications(token),
        api.analyticsDepartments(token),
        api.analyticsPopular(token),
        api.analyticsTrends(token),
        api.adminAnnouncements(token)
      ]);

      setOverview(overviewResult.totals || {});
      setStudents(studentResult.users || []);
      setUniversities(universityResult.users || []);
      setFreezeInfo(freezeResult);
      setCatalog(catalogResult.courses || []);
      setApplicationQueue(applicationResult.applications || []);
      setDepartmentReport(departmentsResult.report || []);
      setPopularCourses(popularResult.courses || []);
      setTrends(trendsResult.trends || []);
      setAnnouncementHistory(announcementsResult.announcements || []);
    } catch (requestError) {
      onError(toMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportReport = async (format) => {
    try {
      const response = await api.exportReport(token, format);
      const blob = await response.blob();
      const extension = format === "pdf" ? "pdf" : "csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eduvista-report.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onNotice(`Report exported as ${extension.toUpperCase()}.`);
    } catch (requestError) {
      onError(toMessage(requestError));
    }
  };

  const incompleteUniversities = useMemo(
    () => universities.filter((item) => !Number(item.profile_complete)),
    [universities]
  );
  const listingsNeedingAttention = useMemo(
    () =>
      catalog.filter(
        (course) =>
          !course.application_deadline ||
          !course.approx_fee_total ||
          !course.eligible_academic_levels ||
          !course.qualification_required
      ),
    [catalog]
  );
  const categoryDemand = useMemo(() => {
    const grouped = new Map();

    catalog.forEach((course) => {
      const key = course.category || "Uncategorized";
      if (!grouped.has(key)) {
        grouped.set(key, {
          category: key,
          course_count: 0,
          application_count: 0
        });
      }

      const entry = grouped.get(key);
      entry.course_count += 1;
      entry.application_count += Number(course.application_count || 0);
    });

    return [...grouped.values()].sort((left, right) => right.application_count - left.application_count);
  }, [catalog]);

  if (loading) {
    return <p className="loading-copy">Loading admin workspace...</p>;
  }

  return (
    <DashboardShell
      profile={profile}
      pages={pages}
      activePage={page}
      setActivePage={setPage}
      onLogout={onLogout}
      error={error}
      notice={notice}
    >
      {page === "overview" ? (
        <>
          <section className="stat-grid">
            <StatCard label="Students" value={overview.students || 0} note="Registered applicants" />
            <StatCard label="Universities" value={overview.universities || 0} note="Publishing institutions" />
            <StatCard label="Admissions Courses" value={overview.courses || 0} note="Visible in catalog" />
            <StatCard label="Applications" value={overview.admissionsApplications || 0} note="Incoming admissions pipeline" />
          </section>

          <Panel title="Admissions Health" note="Quick checks for listing quality and review operations.">
            <div className="stat-grid">
              <div className="detail-card">
                <h3>Ready university profiles</h3>
                <p>{overview.readyUniversities || 0}</p>
              </div>
              <div className="detail-card">
                <h3>Eligibility-ready listings</h3>
                <p>{overview.admissionsReadyCourses || 0}</p>
              </div>
              <div className="detail-card">
                <h3>Needs review</h3>
                <p>{overview.listingsNeedingReview || listingsNeedingAttention.length}</p>
              </div>
              <div className="detail-card">
                <h3>Review queue</h3>
                <p>{overview.admissionsReviewQueue || 0}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Operational Watchlist" note="Fix these first to keep the university-side catalog healthy.">
            <div className="split-grid">
              <div className="detail-card">
                <h3>Incomplete university onboarding</h3>
                <p>{incompleteUniversities.length} universities still missing a complete public profile.</p>
              </div>
              <div className="detail-card">
                <h3>Listings missing core fields</h3>
                <p>{listingsNeedingAttention.length} courses are missing deadline, fee, eligibility, or qualification data.</p>
              </div>
              <div className="detail-card">
                <h3>System state</h3>
                <p>{freezeInfo.frozen ? "Registrations frozen" : "Registrations open"}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Recent Review Queue" note="Applications that currently need admin attention across universities.">
            {applicationQueue.length === 0 ? (
              <EmptyState copy="No admissions applications are waiting in the queue." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Status</th>
                      <th>Fit Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicationQueue.slice(0, 6).map((item) => (
                      <tr key={item.id}>
                        <td>{item.student_name}</td>
                        <td>{item.title}</td>
                        <td>
                          <StatusPill status={item.status} />
                        </td>
                        <td>{item.fit_score || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Recent Announcements" note="Latest notices sent across the platform.">
            {announcementHistory.length === 0 ? (
              <EmptyState copy="No announcements published yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Audience</th>
                      <th>Posted By</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {announcementHistory.slice(0, 6).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.title}</strong>
                          <span>{item.body}</span>
                        </td>
                        <td>{item.target_role}</td>
                        <td>{item.posted_by_name}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {page === "accounts" ? (
        <>
          <Panel title="Student Accounts" note="Applicant quality and academic background at a glance.">
            {students.length === 0 ? (
              <EmptyState copy="No student accounts." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Year</th>
                      <th>CGPA</th>
                      <th>Department</th>
                      <th>Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td>{student.full_name}</td>
                        <td>{student.email}</td>
                        <td>{student.year_level}</td>
                        <td>{student.cgpa}</td>
                        <td>{student.department_name || "-"}</td>
                        <td>
                          <StatusPill status={Number(student.profile_complete) ? "ready" : "incomplete"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="University Accounts" note="Institutions currently publishing admissions inventory.">
            {universities.length === 0 ? (
              <EmptyState copy="No university accounts." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>University</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Location</th>
                      <th>Courses</th>
                      <th>Profile</th>
                      <th>Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {universities.map((university) => (
                      <tr key={university.id}>
                        <td>{university.university_name || "-"}</td>
                        <td>{university.full_name}</td>
                        <td>{university.email}</td>
                        <td>
                          {university.university_city || "-"}, {university.university_state || "-"}
                        </td>
                        <td>{university.course_count || 0}</td>
                        <td>
                          <StatusPill status={Number(university.profile_complete) ? "ready" : "incomplete"} />
                        </td>
                        <td>{university.department_name || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {page === "catalog" ? (
        <Panel title="Admissions Catalog" note="Dataset-style course inventory across all universities.">
          {catalog.length === 0 ? (
            <EmptyState copy="No courses are currently published." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>University</th>
                    <th>Category</th>
                    <th>Course</th>
                    <th>State</th>
                    <th>City/Location</th>
                    <th>Duration</th>
                    <th>Qualification</th>
                    <th>Eligibility</th>
                    <th>Fee</th>
                    <th>Deadline</th>
                    <th>Applicants</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((course) => (
                    <tr key={course.id}>
                      <td>{course.university_name || "-"}</td>
                      <td>{course.category || "-"}</td>
                      <td>
                        <strong>{course.title}</strong>
                        <span>{course.code}</span>
                      </td>
                      <td>{course.location_state || "-"}</td>
                      <td>{course.location_city || "-"}</td>
                      <td>{course.duration_label || "-"}</td>
                      <td>{course.qualification_required || "-"}</td>
                      <td>
                        {formatEligibleAcademicLevels(course.eligible_academic_levels)}
                        {course.minimum_score_percent ? ` | ${course.minimum_score_percent}%+` : ""}
                      </td>
                      <td>{course.approx_fee_total || "-"}</td>
                      <td>{formatDate(course.application_deadline)}</td>
                      <td>{course.application_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {page === "analytics" ? (
        <>
          <Panel
            title="Exports"
            note="Generate downloadable admin reports from the current dataset."
            actions={
              <div className="row-actions">
                <button type="button" onClick={() => exportReport("excel")}>
                  Export CSV
                </button>
                <button type="button" className="outline-btn" onClick={() => exportReport("pdf")}>
                  Export PDF
                </button>
              </div>
            }
          >
            <div className="split-grid">
              <div className="detail-card">
                <h3>Application leaderboard</h3>
                <p>{popularCourses.length} courses in the demand ranking</p>
              </div>
              <div className="detail-card">
                <h3>Department rows</h3>
                <p>{departmentReport.length} departments in admissions analytics</p>
              </div>
              <div className="detail-card">
                <h3>Trend periods</h3>
                <p>{trends.length} monthly points exported</p>
              </div>
            </div>
          </Panel>

          <Panel title="Department Report" note="Department-wise course supply and application demand.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Courses</th>
                    <th>Applications</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentReport.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.course_count}</td>
                      <td>{item.application_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Category Demand" note="Which categories students are responding to most.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Courses</th>
                    <th>Applications</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryDemand.map((item) => (
                    <tr key={item.category}>
                      <td>{item.category}</td>
                      <td>{item.course_count}</td>
                      <td>{item.application_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Most Popular Courses" note="Current demand snapshot across the admissions pipeline.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>University</th>
                    <th>Course</th>
                    <th>Applications</th>
                    <th>Review Queue</th>
                    <th>Accepted</th>
                    <th>Avg Fit Score</th>
                  </tr>
                </thead>
                <tbody>
                  {popularCourses.map((item) => (
                    <tr key={item.id}>
                      <td>{item.university_name || "-"}</td>
                      <td>
                        <strong>{item.title}</strong>
                        <span>{item.code}</span>
                      </td>
                      <td>{item.application_count}</td>
                      <td>{item.review_queue}</td>
                      <td>{item.accepted_count}</td>
                      <td>{item.avg_fit_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Monthly Trends" note="Application, review, and acceptance movement by month.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Applications</th>
                    <th>Under Review</th>
                    <th>Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((item) => (
                    <tr key={item.month}>
                      <td>{item.month}</td>
                      <td>{item.applications}</td>
                      <td>{item.under_review}</td>
                      <td>{item.accepted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}

      {page === "system" ? (
        <>
          <Panel
            title="System Controls"
            note="Platform-wide controls for the admissions workflow."
            actions={
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.setFreezeStatus(token, !freezeInfo.frozen);
                    onNotice(freezeInfo.frozen ? "Registration opened." : "Registration frozen.");
                    await refresh();
                  } catch (requestError) {
                    onError(toMessage(requestError));
                  }
                }}
              >
                {freezeInfo.frozen ? "Unfreeze" : "Freeze"} Registration
              </button>
            }
          >
            <div className="detail-card">
              <h3>Current state</h3>
              <p>{freezeInfo.frozen ? "Registrations are blocked." : "Registrations are open."}</p>
            </div>
          </Panel>

          <Panel title="Announcement Center" note="Push notices to students, universities, or all users.">
            <form
              className="form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await api.postAnnouncement(token, announcementForm);
                  onNotice("Announcement published.");
                  setAnnouncementForm({ title: "", body: "", targetRole: "all" });
                  await refresh();
                } catch (requestError) {
                  onError(toMessage(requestError));
                }
              }}
            >
              <label>
                Title
                <input
                  value={announcementForm.title}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({
                      ...current,
                      title: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label>
                Audience
                <select
                  value={announcementForm.targetRole}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({
                      ...current,
                      targetRole: event.target.value
                    }))
                  }
                >
                  <option value="all">All</option>
                  <option value="student">Students</option>
                  <option value="university">Universities</option>
                  <option value="admin">Admins</option>
                </select>
              </label>
              <label>
                Body
                <textarea
                  rows={4}
                  value={announcementForm.body}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({
                      ...current,
                      body: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <div className="panel-actions">
                <button type="submit">Publish Announcement</button>
              </div>
            </form>
          </Panel>

          <Panel title="Announcement History" note="Audit trail for admin communication.">
            {announcementHistory.length === 0 ? (
              <EmptyState copy="No announcements available." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Audience</th>
                      <th>Posted By</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {announcementHistory.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.title}</strong>
                          <span>{item.body}</span>
                        </td>
                        <td>{item.target_role}</td>
                        <td>{item.posted_by_name}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </DashboardShell>
  );
}

export default function DashboardPage({ token, currentUser, onLogout, onSessionUserUpdate }) {
  const [profile, setProfile] = useState(currentUser || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const pushError = (message) => {
    setNotice("");
    setError(message);
  };

  const pushNotice = (message) => {
    setError("");
    setNotice(message);
  };

  const syncProfile = (nextUser) => {
    setProfile(nextUser);
    onSessionUserUpdate?.(nextUser);
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const result = await api.me(token);
      syncProfile(result.user);
    } catch (requestError) {
      if (requestError.message.toLowerCase().includes("session")) {
        onLogout();
      } else {
        pushError(toMessage(requestError));
        setProfile(currentUser || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, onLogout]);

  const handleLogout = async () => {
    try {
      await api.logout(token);
    } catch (_error) {
      // local session is cleared regardless
    }
    onLogout();
  };

  if (loading) {
    return <p className="loading-copy">Preparing your dashboard...</p>;
  }

  if (!profile) {
    return (
      <main className="auth-shell">
        <section className="panel dashboard-fallback">
          <div className="panel-head">
            <div>
              <p className="brand-kicker">EduVista</p>
              <h2>Dashboard unavailable</h2>
              <p className="panel-note">{error || "We could not load your account right now."}</p>
            </div>
          </div>
          <div className="panel-actions">
            <button type="button" onClick={loadProfile}>
              Retry
            </button>
            <button type="button" className="outline-btn" onClick={handleLogout}>
              Back to login
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (profile.role === "student") {
    return (
      <StudentDashboard
        token={token}
        profile={profile}
        onError={pushError}
        onNotice={pushNotice}
        onLogout={handleLogout}
        error={error}
      notice={notice}
      onProfileUpdate={syncProfile}
      />
    );
  }

  if (profile.role === "university") {
    return (
      <UniversityDashboard
        token={token}
        profile={profile}
        onError={pushError}
        onNotice={pushNotice}
        onLogout={handleLogout}
        error={error}
        notice={notice}
        onProfileUpdate={syncProfile}
      />
    );
  }

  return (
    <AdminDashboard
      token={token}
      profile={profile}
      onError={pushError}
      onNotice={pushNotice}
      onLogout={handleLogout}
      error={error}
      notice={notice}
    />
  );
}
