import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

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
    <main className="portal-shell">
      <aside className="portal-sidebar">
        <div className="sidebar-brand">
          <p className="sidebar-kicker">EduVista</p>
          <h1>{profile?.role === "university" ? profile.universityName || profile.name : profile?.name}</h1>
          <p className="sidebar-meta">{profile?.role} dashboard</p>
        </div>

        <nav className="sidebar-nav">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={activePage === page.id ? "sidebar-link active" : "sidebar-link"}
              onClick={() => setActivePage(page.id)}
            >
              <span>{page.label}</span>
              <small>{page.note}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>Profile status</p>
          <StatusPill status={profile?.profileComplete ? "ready" : "incomplete"} />
          <button type="button" className="outline-btn full-width" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-header">
          <div>
            <p className="brand-kicker">Classic Admissions Workspace</p>
            <h1>{pages.find((page) => page.id === activePage)?.label}</h1>
            <p>
              {profile?.role === "student"
                ? `Academic level: ${profile?.academicLevel || "Not set"}`
                : `Department: ${profile?.departmentName || "Not set"}`}{" "}
              | Account:{" "}
              <StatusPill status={profile?.role || "user"} />
            </p>
          </div>
        </header>

        {error ? <p className="banner error">{error}</p> : null}
        {notice ? <p className="banner success">{notice}</p> : null}

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
  const [page, setPage] = useState("overview");
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
    { id: "overview", label: "Overview", note: "Profile, alerts, and quick actions" },
    { id: "discover", label: "Course Suggestions", note: "Browse recommended colleges and courses" },
    { id: "applications", label: "Applications", note: "Track status and upload requested files" },
    { id: "profile", label: "Profile Record", note: "Academic details stored in the database" }
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
    { label: "Applications", value: applications.length, note: "Submitted course applications" },
    {
      label: "Unread Alerts",
      value: notifications.summary?.unread || 0,
      note: "System and university messages"
    },
    {
      label: "Documents",
      value: studentDocuments.length,
      note: "Academic files linked to your profile"
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
      {page === "overview" ? (
        <>
          <section className="stat-grid">
            {stats.map((item) => (
              <StatCard key={item.label} {...item} />
            ))}
          </section>

          <Panel title="Profile Snapshot" note="This data is used for course suggestions and registration decisions.">
            <div className="split-grid">
              <div className="detail-card">
                <h3>{studentProfile?.full_name || profile.name}</h3>
                <p>Academic level: {studentProfile?.academic_level || profile.academicLevel || "-"}</p>
                <p>Board: {studentProfile?.board_name || "-"}</p>
                <p>School: {studentProfile?.school_name || "-"}</p>
                <p>Score: {studentProfile?.score_percent || "-"}%</p>
              </div>
              <div className="detail-card">
                <h3>Course direction</h3>
                <p>{studentProfile?.target_course || "Not added yet."}</p>
                <p>{studentProfile?.marks_summary || "No marks summary added yet."}</p>
                <div className="row-actions top-gap">
                  <button type="button" onClick={() => navigate("/profile-setup")}>
                    Edit Profile Setup
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Inbox"
            note="Recent alerts from the platform and universities."
            actions={
              notifications.summary?.unread ? (
                <button
                  type="button"
                  className="outline-btn"
                  onClick={async () => {
                    try {
                      await api.markAllNotificationsRead(token);
                      onNotice("Notifications marked as read.");
                      await refresh();
                    } catch (requestError) {
                      onError(toMessage(requestError));
                    }
                  }}
                >
                  Mark all read
                </button>
              ) : null
            }
          >
            {notifications.notifications?.length ? (
              <ul className="document-list">
                {notifications.notifications.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.category.replace(/_/g, " ")}</strong>
                      <span>{item.message}</span>
                    </div>
                    <small>{formatDateTime(item.created_at)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState copy="No alerts yet." />
            )}
          </Panel>

          <Panel title="Recent Notices" note="Admissions updates and deadlines.">
            {announcements.length === 0 ? (
              <EmptyState copy="No active notices." />
            ) : (
              <div className="card-list">
                {announcements.slice(0, 3).map((notice) => (
                  <article key={notice.id} className="notice-card">
                    <h3>{notice.title}</h3>
                    <p>{notice.body}</p>
                    <small>{formatDateTime(notice.created_at)}</small>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : null}

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
                  <StatusPill
                    status={course.application_status || (course.is_closed ? "closed" : "open")}
                  />
                </div>
                <h3>{course.title}</h3>
                <p className="catalog-school">{course.university_name}</p>
                <p className="catalog-meta">
                  {course.location_city}, {course.location_state} | {course.duration_label}
                </p>
                <p>{course.description}</p>
                <ul className="meta-list">
                  <li>Qualification: {course.qualification_required}</li>
                  <li>Fee: {course.approx_fee_total || "Contact university"}</li>
                  <li>Deadline: {formatDate(course.application_deadline)}</li>
                  <li>Required documents: {course.requirement_count}</li>
                </ul>
                <div className="info-block">
                  <strong>Student application note</strong>
                  <p>{course.application_bar_label || "Upload required files and apply."}</p>
                </div>
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
                        disabled={Boolean(course.is_closed)}
                        onClick={() =>
                          setApplicationDraft({
                            courseId: course.id,
                            statement: ""
                          })
                        }
                      >
                        {course.is_closed ? "Deadline Passed" : "Apply Now"}
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
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({
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
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState({ totalCourses: 0, totalApplications: 0, pendingReviews: 0 });
  const [courses, setCourses] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [applications, setApplications] = useState([]);
  const [applicationDetail, setApplicationDetail] = useState(null);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseForm, setCourseForm] = useState({
    code: "",
    title: "",
    category: "Engineering",
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
    approxFeeTotal: "",
    applicationDeadline: "",
    brochurePath: "",
    requiredDocumentsIntro: ""
  });
  const [requirementForm, setRequirementForm] = useState({
    documentName: "",
    instructions: "",
    isRequired: true
  });

  const buildEmptyCourseForm = (state = profileForm.state || "", city = profileForm.city || "") => ({
    code: "",
    title: "",
    category: "Engineering",
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
    approxFeeTotal: "",
    applicationDeadline: "",
    brochurePath: "",
    requiredDocumentsIntro: ""
  });

  const pages = [
    { id: "overview", label: "Overview", note: "Admissions activity and portfolio" },
    { id: "profile", label: "University Profile", note: "Brand, contact, application bar" },
    { id: "courses", label: "Publish Courses", note: "Dataset-style course management" },
    { id: "applications", label: "Review Applications", note: "Shortlist and decide applicants" }
  ];

  const refresh = async () => {
    setLoading(true);
    try {
      const [profileResult, meResult, signupMeta, dashboardResult, courseResult, applicationResult] =
        await Promise.all([
          api.profile(token),
          api.me(token),
          api.signupMeta(),
          api.universityDashboard(token),
          api.universityCourses(token),
          api.universityApplications(token)
        ]);

      onProfileUpdate(meResult.user);
      setDepartments(signupMeta.departments || []);
      setStats(dashboardResult.stats || {});
      setCourses(courseResult.courses || []);
      setApplications(applicationResult.applications || []);
      setProfileForm({
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

  const saveCourse = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...courseForm,
        credits: Number(courseForm.credits),
        seatsTotal: Number(courseForm.seatsTotal),
        departmentId: courseForm.departmentId ? Number(courseForm.departmentId) : null
      };

      if (editingCourseId) {
        await api.updateUniversityCourse(token, editingCourseId, payload);
        onNotice("Course updated.");
      } else {
        await api.createUniversityCourse(token, payload);
        onNotice("Course published.");
      }

      setEditingCourseId(null);
      setCourseForm(buildEmptyCourseForm());
      await refresh();
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

  const uploadAsset = async (field, file) => {
    if (!file) {
      return;
    }
    try {
      const result = await api.uploadUniversityAsset(token, file);
      if (field === "brochurePath") {
        setCourseForm((current) => ({ ...current, brochurePath: result.filePath }));
      } else {
        setProfileForm((current) => ({ ...current, [field]: result.filePath }));
      }
      onNotice("Asset uploaded.");
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
      {page === "overview" ? (
        <>
          <section className="stat-grid">
            <StatCard label="Published Courses" value={stats.totalCourses} note="Live in admissions catalog" />
            <StatCard label="Applications" value={stats.totalApplications} note="All incoming applications" />
            <StatCard label="Pending Review" value={stats.pendingReviews} note="Needs decision" />
            <StatCard
              label="Profile"
              value={profile.profileComplete ? "Ready" : "Incomplete"}
              note="Complete brand + location details"
            />
          </section>

          <Panel title="Recent Applications" note="Quick view of student pipeline">
            {applications.length === 0 ? (
              <EmptyState copy="No applications yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Status</th>
                      <th>Documents</th>
                      <th>Fit Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.slice(0, 6).map((item) => (
                      <tr key={item.id}>
                        <td>{item.student_name}</td>
                        <td>{item.title}</td>
                        <td><StatusPill status={item.status} /></td>
                        <td>{item.document_count}</td>
                        <td>{item.fit_score || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Publishing Checklist" note="Keep these complete for stronger conversion on the student catalog.">
            <div className="checklist-grid">
              <div className="check-card">
                <StatusPill status={profileForm.universityName ? "ready" : "incomplete"} />
                <strong>Institution identity</strong>
              </div>
              <div className="check-card">
                <StatusPill status={profileForm.state && profileForm.city ? "ready" : "incomplete"} />
                <strong>Location details</strong>
              </div>
              <div className="check-card">
                <StatusPill status={profileForm.applicationBarLabel ? "ready" : "incomplete"} />
                <strong>Application guidance bar</strong>
              </div>
              <div className="check-card">
                <StatusPill status={courses.length ? "ready" : "incomplete"} />
                <strong>Published courses</strong>
              </div>
            </div>
          </Panel>
        </>
      ) : null}

      {page === "profile" ? (
        <Panel title="University Identity" note="Set the public identity students see on the discovery page.">
          <form className="form-grid" onSubmit={saveProfile}>
            <div className="form-columns two">
              <label>
                Contact name
                <input
                  value={profileForm.fullName}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                />
              </label>
              <label>
                University name
                <input
                  value={profileForm.universityName}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      universityName: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label>
                Short name
                <input
                  value={profileForm.shortName}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, shortName: event.target.value }))
                  }
                />
              </label>
              <label>
                Department
                <select
                  value={profileForm.departmentId}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      departmentId: event.target.value
                    }))
                  }
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                State
                <input
                  value={profileForm.state}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, state: event.target.value }))
                  }
                />
              </label>
              <label>
                City
                <input
                  value={profileForm.city}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, city: event.target.value }))
                  }
                />
              </label>
              <label>
                Contact email
                <input
                  value={profileForm.contactEmail}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      contactEmail: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Contact phone
                <input
                  value={profileForm.contactPhone}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      contactPhone: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Website
                <input
                  value={profileForm.websiteUrl}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, websiteUrl: event.target.value }))
                  }
                />
              </label>
              <label>
                Accreditation
                <input
                  value={profileForm.accreditation}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      accreditation: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            <label>
              Address
              <input
                value={profileForm.addressLine}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    addressLine: event.target.value
                  }))
                }
              />
            </label>
            <label>
              Public description
              <textarea
                rows={4}
                value={profileForm.description}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
            </label>
            <label>
              Student-facing application bar text
              <input
                value={profileForm.applicationBarLabel}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    applicationBarLabel: event.target.value
                  }))
                }
                placeholder="Upload marksheets, entrance score card, ID proof..."
              />
            </label>

            <div className="asset-row">
              <label className="asset-uploader">
                <span>Upload logo</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(event) => uploadAsset("logoPath", event.target.files?.[0] || null)}
                />
              </label>
              <label className="asset-uploader">
                <span>Upload banner</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(event) => uploadAsset("bannerPath", event.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="asset-preview-row">
              {profileForm.logoPath ? (
                <a className="text-link" href={toAssetUrl(profileForm.logoPath)} target="_blank" rel="noreferrer">
                  Current logo
                </a>
              ) : null}
              {profileForm.bannerPath ? (
                <a className="text-link" href={toAssetUrl(profileForm.bannerPath)} target="_blank" rel="noreferrer">
                  Current banner
                </a>
              ) : null}
            </div>

            <div className="panel-actions">
              <button type="submit">Save University Profile</button>
            </div>
          </form>
        </Panel>
      ) : null}

      {page === "courses" ? (
        <>
          <Panel
            title={editingCourseId ? "Edit Course" : "Publish Course"}
            note="Use dataset-style fields so students can compare universities cleanly."
            actions={
              editingCourseId ? (
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => {
                    setEditingCourseId(null);
                    setCourseForm(buildEmptyCourseForm());
                  }}
                >
                  Cancel Edit
                </button>
              ) : null
            }
          >
            <form className="form-grid" onSubmit={saveCourse}>
              <div className="form-columns two">
                <label>
                  Course code
                  <input
                    value={courseForm.code}
                    onChange={(event) =>
                      setCourseForm((current) => ({ ...current, code: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Course title
                  <input
                    value={courseForm.title}
                    onChange={(event) =>
                      setCourseForm((current) => ({ ...current, title: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Category
                  <input
                    value={courseForm.category}
                    onChange={(event) =>
                      setCourseForm((current) => ({ ...current, category: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Duration
                  <input
                    value={courseForm.durationLabel}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        durationLabel: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  State
                  <input
                    value={courseForm.locationState}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        locationState: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  City
                  <input
                    value={courseForm.locationCity}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        locationCity: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Approx fee
                  <input
                    value={courseForm.approxFeeTotal}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        approxFeeTotal: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Deadline
                  <input
                    type="date"
                    value={courseForm.applicationDeadline}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        applicationDeadline: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Seats
                  <input
                    type="number"
                    min="1"
                    value={courseForm.seatsTotal}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        seatsTotal: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Credits
                  <input
                    type="number"
                    min="1"
                    value={courseForm.credits}
                    onChange={(event) =>
                      setCourseForm((current) => ({ ...current, credits: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Department
                  <select
                    value={courseForm.departmentId}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        departmentId: event.target.value
                      }))
                    }
                  >
                    <option value="">Select department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Qualification required
                  <input
                    value={courseForm.qualificationRequired}
                    onChange={(event) =>
                      setCourseForm((current) => ({
                        ...current,
                        qualificationRequired: event.target.value
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <label>
                Schedule block
                <input
                  value={courseForm.scheduleBlock}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      scheduleBlock: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Course description
                <textarea
                  rows={4}
                  value={courseForm.description}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Required documents guidance
                <textarea
                  rows={3}
                  value={courseForm.requiredDocumentsIntro}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      requiredDocumentsIntro: event.target.value
                    }))
                  }
                />
              </label>
              <div className="asset-row">
                <label className="asset-uploader">
                  <span>Upload brochure / prospectus</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => uploadAsset("brochurePath", event.target.files?.[0] || null)}
                  />
                </label>
                {courseForm.brochurePath ? (
                  <a className="text-link" href={toAssetUrl(courseForm.brochurePath)} target="_blank" rel="noreferrer">
                    Current brochure
                  </a>
                ) : null}
              </div>

              <div className="panel-actions">
                <button type="submit">{editingCourseId ? "Save Changes" : "Publish Course"}</button>
              </div>
            </form>
          </Panel>

          <Panel title="Published Courses" note="Manage requirements and remove outdated listings.">
            {courses.length === 0 ? (
              <EmptyState copy="No published courses yet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Location</th>
                      <th>Qualification</th>
                      <th>Fee</th>
                      <th>Requirements</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course) => (
                      <tr key={course.id}>
                        <td>
                          <strong>{course.title}</strong>
                          <span>{course.code}</span>
                        </td>
                        <td>{course.location_city}, {course.location_state}</td>
                        <td>{course.qualification_required}</td>
                        <td>{course.approx_fee_total}</td>
                        <td>{course.requirement_count}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="outline-btn"
                              onClick={() => {
                                setEditingCourseId(course.id);
                                setCourseForm({
                                  code: course.code || "",
                                  title: course.title || "",
                                  category: course.category || "Engineering",
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
                                  approxFeeTotal: course.approx_fee_total || "",
                                  applicationDeadline: course.application_deadline
                                    ? String(course.application_deadline).slice(0, 10)
                                    : "",
                                  brochurePath: course.brochure_path || "",
                                  requiredDocumentsIntro: course.required_documents_intro || ""
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" className="outline-btn" onClick={() => loadRequirements(course.id)}>
                              Requirements
                            </button>
                            <button
                              type="button"
                              className="outline-btn"
                              onClick={async () => {
                                try {
                                  await api.deleteUniversityCourse(token, course.id);
                                  onNotice("Course deleted.");
                                  if (selectedCourseId === course.id) {
                                    setSelectedCourseId(null);
                                    setRequirements([]);
                                  }
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
          </Panel>

          <Panel title="Required Documents" note="Define what students must upload per course.">
            {!selectedCourseId ? (
              <EmptyState copy="Select a course from the table above to manage requirements." />
            ) : (
              <>
                <div className="detail-card">
                  <h3>{courses.find((course) => course.id === selectedCourseId)?.title || "Selected course"}</h3>
                  <p>Requirement builder for the student application page.</p>
                </div>
                <form className="upload-strip" onSubmit={addRequirement}>
                  <input
                    placeholder="Document name"
                    value={requirementForm.documentName}
                    onChange={(event) =>
                      setRequirementForm((current) => ({
                        ...current,
                        documentName: event.target.value
                      }))
                    }
                  />
                  <input
                    placeholder="Instructions"
                    value={requirementForm.instructions}
                    onChange={(event) =>
                      setRequirementForm((current) => ({
                        ...current,
                        instructions: event.target.value
                      }))
                    }
                  />
                  <button type="submit">Add Requirement</button>
                </form>

                {requirements.length === 0 ? (
                  <EmptyState copy="No requirements defined yet." />
                ) : (
                  <ul className="document-list top-gap">
                    {requirements.map((requirement) => (
                      <li key={requirement.id}>
                        <div>
                          <strong>{requirement.document_name}</strong>
                          <span>{requirement.instructions || "No instructions"}</span>
                        </div>
                        <button
                          type="button"
                          className="outline-btn"
                          onClick={async () => {
                            try {
                              await api.deleteCourseRequirement(token, requirement.id);
                              onNotice("Requirement removed.");
                              await loadRequirements(selectedCourseId);
                            } catch (requestError) {
                              onError(toMessage(requestError));
                            }
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
        </>
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
    { id: "overview", label: "Overview", note: "Users, notices, and current system state" },
    { id: "accounts", label: "Accounts", note: "Students and universities" },
    { id: "catalog", label: "Catalog", note: "Admissions inventory across universities" },
    { id: "analytics", label: "Analytics", note: "Reports, demand, and trends" },
    { id: "system", label: "System Controls", note: "Freeze state and announcements" }
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
        departmentsResult,
        popularResult,
        trendsResult,
        announcementsResult
      ] = await Promise.all([
        api.analyticsOverview(token),
        api.adminUsers(token, { role: "student" }),
        api.adminUsers(token, { role: "university" }),
        api.freezeStatus(token),
        api.universityCourses(token),
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
            <StatCard label="Courses" value={overview.courses || 0} note="Visible in catalog" />
            <StatCard label="Waitlisted" value={overview.waitlisted || 0} note="Legacy queue pressure" />
          </section>

          <Panel title="Account Mix" note="Quick check of adoption across roles.">
            <div className="split-grid">
              <div className="detail-card">
                <h3>Students</h3>
                <p>{students.length} accounts</p>
              </div>
              <div className="detail-card">
                <h3>Universities</h3>
                <p>{universities.length} accounts</p>
              </div>
              <div className="detail-card">
                <h3>System state</h3>
                <p>{freezeInfo.frozen ? "Registrations frozen" : "Registrations open"}</p>
              </div>
            </div>
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
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {universities.map((university) => (
                      <tr key={university.id}>
                        <td>{university.full_name}</td>
                        <td>{university.email}</td>
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
        <Panel title="Admissions Catalog" note="Cross-university course inventory and live demand.">
          {catalog.length === 0 ? (
            <EmptyState copy="No courses are currently published." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>University</th>
                    <th>Course</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Deadline</th>
                    <th>Applicants</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((course) => (
                    <tr key={course.id}>
                      <td>{course.university_name || "-"}</td>
                      <td>
                        <strong>{course.title}</strong>
                        <span>{course.code}</span>
                      </td>
                      <td>{course.category}</td>
                      <td>{course.location_city || "-"}, {course.location_state || "-"}</td>
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
                <h3>Popular courses</h3>
                <p>{popularCourses.length} courses in the leaderboard</p>
              </div>
              <div className="detail-card">
                <h3>Department rows</h3>
                <p>{departmentReport.length} departments in analytics</p>
              </div>
              <div className="detail-card">
                <h3>Trend periods</h3>
                <p>{trends.length} monthly points exported</p>
              </div>
            </div>
          </Panel>

          <Panel title="Department Report" note="Department-wise course and enrollment activity.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Courses</th>
                    <th>Active Enrollments</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentReport.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.course_count}</td>
                      <td>{item.active_enrollments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Most Popular Courses" note="Current demand snapshot across the legacy registration engine.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Active Enrollments</th>
                    <th>Waitlist</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {popularCourses.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <span>{item.code}</span>
                      </td>
                      <td>{item.active_enrollments}</td>
                      <td>{item.waitlist_count}</td>
                      <td>{item.avg_rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Monthly Trends" note="Registration and waitlist movement by month.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Registrations</th>
                    <th>Waitlisted</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((item) => (
                    <tr key={item.month}>
                      <td>{item.month}</td>
                      <td>{item.registrations}</td>
                      <td>{item.waitlisted}</td>
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
            note="Platform-wide controls for the legacy registration engine."
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

export default function DashboardPage({ token, currentUser, onLogout }) {
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

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const result = await api.me(token);
        setProfile(result.user);
      } catch (requestError) {
        if (requestError.message.toLowerCase().includes("session")) {
          onLogout();
        } else {
          pushError(toMessage(requestError));
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
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
    return <p className="loading-copy">Session expired.</p>;
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
        onProfileUpdate={setProfile}
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
        onProfileUpdate={setProfile}
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
