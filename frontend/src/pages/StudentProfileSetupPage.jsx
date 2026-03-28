import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(
  /\/api$/,
  ""
);

const toAssetUrl = (filePath) => {
  if (!filePath) {
    return "";
  }
  if (filePath.startsWith("http")) {
    return filePath;
  }
  return `${API_ORIGIN}${filePath}`;
};

const DOCUMENT_TYPES = [
  { value: "marksheet", label: "10th / 12th Marksheet" },
  { value: "certificate", label: "Passing Certificate" },
  { value: "id_proof", label: "ID Proof" },
  { value: "transfer_certificate", label: "Transfer Certificate" },
  { value: "other", label: "Other" }
];

export default function StudentProfileSetupPage({
  token,
  currentUser,
  onSessionUserUpdate,
  onLogout
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [documents, setDocuments] = useState([]);
  const [profileReady, setProfileReady] = useState(Boolean(currentUser?.profileComplete));
  const [form, setForm] = useState({
    fullName: "",
    academicLevel: currentUser?.academicLevel || "12",
    phone: currentUser?.phone || "",
    guardianPhone: currentUser?.guardianPhone || "",
    guardianName: "",
    dateOfBirth: "",
    gender: "",
    addressLine: "",
    city: "",
    state: "",
    schoolName: "",
    boardName: "",
    streamName: "",
    passingYear: "",
    scorePercent: "",
    examRollNo: "",
    targetCourse: "",
    marksSummary: "",
    bio: ""
  });
  const [uploadForm, setUploadForm] = useState({
    documentType: "marksheet",
    file: null
  });

  const checklist = useMemo(
    () => [
      { label: "Student phone", done: Boolean(form.phone) },
      { label: "Parent phone", done: Boolean(form.guardianPhone) },
      { label: "Academic level", done: Boolean(form.academicLevel) },
      { label: "Board and school", done: Boolean(form.boardName && form.schoolName) },
      { label: "Score / percentage", done: Boolean(form.scorePercent) },
      { label: "Location", done: Boolean(form.city && form.state) },
      { label: "Academic document", done: documents.length > 0 }
    ],
    [documents.length, form]
  );

  const loadProfile = async () => {
    setLoading(true);
    try {
      const [profileResult, meResult] = await Promise.all([api.profile(token), api.me(token)]);
      onSessionUserUpdate(meResult.user);
      setProfileReady(Boolean(meResult.user.profileComplete));
      setDocuments(profileResult.documents || []);
      setForm({
        fullName: profileResult.profile?.full_name || meResult.user.name || "",
        academicLevel:
          profileResult.profile?.academic_level || meResult.user.academicLevel || "12",
        phone: profileResult.profile?.phone || meResult.user.phone || "",
        guardianPhone:
          profileResult.profile?.guardian_phone || meResult.user.guardianPhone || "",
        guardianName: profileResult.profile?.guardian_name || "",
        dateOfBirth: profileResult.profile?.date_of_birth || "",
        gender: profileResult.profile?.gender || "",
        addressLine: profileResult.profile?.address_line || "",
        city: profileResult.profile?.city || "",
        state: profileResult.profile?.state || "",
        schoolName: profileResult.profile?.school_name || "",
        boardName: profileResult.profile?.board_name || "",
        streamName: profileResult.profile?.stream_name || "",
        passingYear: String(profileResult.profile?.passing_year || ""),
        scorePercent:
          profileResult.profile?.score_percent === null ||
            profileResult.profile?.score_percent === undefined
            ? ""
            : String(profileResult.profile?.score_percent),
        examRollNo: profileResult.profile?.exam_roll_no || "",
        targetCourse: profileResult.profile?.target_course || "",
        marksSummary: profileResult.profile?.marks_summary || "",
        bio: profileResult.profile?.bio || ""
      });
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.updateProfile(token, form);
      const meResult = await api.me(token);
      onSessionUserUpdate(meResult.user);
      setProfileReady(Boolean(meResult.user.profileComplete));
      setNotice("Profile saved.");
      if (meResult.user.profileComplete) {
        navigate("/dashboard", { replace: true });
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async (event) => {
    event.preventDefault();
    if (!uploadForm.file) {
      setError("Choose a file before uploading.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      await api.uploadStudentDocument(token, {
        documentType: uploadForm.documentType,
        academicLevel: form.academicLevel,
        file: uploadForm.file
      });
      setUploadForm({ documentType: "marksheet", file: null });
      await loadProfile();
      setNotice("Document uploaded.");
    } catch (requestError) {
      setError(requestError.message || "Unable to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (documentId) => {
    try {
      await api.deleteStudentDocument(token, documentId);
      await loadProfile();
      setNotice("Document removed.");
    } catch (requestError) {
      setError(requestError.message || "Unable to remove document.");
    }
  };

  if (loading) {
    return <p className="loading-copy">Preparing profile setup...</p>;
  }

  return (
    <main className="profile-setup-shell">
      <section className="profile-setup-panel">
        <div className="profile-setup-head">
          <div>
            <p className="brand-kicker">Student Onboarding</p>
            <h1>Complete your academic profile before opening the dashboard.</h1>
            <p className="landing-subtitle">
              This platform is for 10th and 12th students. Add your academic details and upload
              at least one supporting document so course suggestions and registrations are based on
              real profile data.
            </p>
          </div>
          <div className="profile-setup-actions">
            <button type="button" className="outline-btn" onClick={onLogout}>
              Logout
            </button>
            <button
              type="button"
              disabled={!profileReady}
              onClick={() => navigate("/dashboard", { replace: true })}
            >
              Continue to Dashboard
            </button>
          </div>
        </div>

        {error ? <p className="banner error">{error}</p> : null}
        {notice ? <p className="banner success">{notice}</p> : null}

        <div className="checklist-grid">
          {checklist.map((item) => (
            <article key={item.label} className="check-card">
              <span className={`status-pill ${item.done ? "ok" : "warn"}`}>
                {item.done ? "ready" : "missing"}
              </span>
              <strong>{item.label}</strong>
            </article>
          ))}
        </div>

        <form className="panel top-gap" onSubmit={saveProfile}>
          <div className="panel-head">
            <div>
              <h2>Profile Details</h2>
              <p className="panel-note">
                Save your personal and academic details. The dashboard is unlocked when the core
                fields and at least one document are available.
              </p>
            </div>
          </div>

          <div className="form-columns two">
            <label>
              Full name
              <input
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fullName: event.target.value }))
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
                <option value="10">10th</option>
                <option value="12">12th</option>
              </select>
            </label>
            <label>
              Student phone
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Parent phone
              <input
                value={form.guardianPhone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, guardianPhone: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Parent name
              <input
                value={form.guardianName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, guardianName: event.target.value }))
                }
              />
            </label>
            <label>
              Date of birth
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dateOfBirth: event.target.value }))
                }
              />
            </label>
            <label>
              Gender
              <input
                value={form.gender}
                onChange={(event) =>
                  setForm((current) => ({ ...current, gender: event.target.value }))
                }
              />
            </label>
            <label>
              School name
              <input
                value={form.schoolName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, schoolName: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Board
              <input
                value={form.boardName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, boardName: event.target.value }))
                }
                placeholder="State Board, CBSE, ICSE..."
                required
              />
            </label>
            <label>
              Stream
              <input
                value={form.streamName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, streamName: event.target.value }))
                }
                placeholder="Science, Commerce, Humanities..."
              />
            </label>
            <label>
              Passing year
              <input
                type="number"
                min="2018"
                max="2035"
                value={form.passingYear}
                onChange={(event) =>
                  setForm((current) => ({ ...current, passingYear: event.target.value }))
                }
              />
            </label>
            <label>
              Percentage / score
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.scorePercent}
                onChange={(event) =>
                  setForm((current) => ({ ...current, scorePercent: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Roll / register number
              <input
                value={form.examRollNo}
                onChange={(event) =>
                  setForm((current) => ({ ...current, examRollNo: event.target.value }))
                }
              />
            </label>
            <label>
              Target course interest
              <input
                value={form.targetCourse}
                onChange={(event) =>
                  setForm((current) => ({ ...current, targetCourse: event.target.value }))
                }
                placeholder="Engineering, Nursing, Commerce..."
              />
            </label>
            <label>
              City
              <input
                value={form.city}
                onChange={(event) =>
                  setForm((current) => ({ ...current, city: event.target.value }))
                }
                required
              />
            </label>
            <label>
              State
              <input
                value={form.state}
                onChange={(event) =>
                  setForm((current) => ({ ...current, state: event.target.value }))
                }
                required
              />
            </label>
          </div>

          <label>
            Address
            <input
              value={form.addressLine}
              onChange={(event) =>
                setForm((current) => ({ ...current, addressLine: event.target.value }))
              }
            />
          </label>
          <label>
            Marks summary
            <textarea
              rows={3}
              value={form.marksSummary}
              onChange={(event) =>
                setForm((current) => ({ ...current, marksSummary: event.target.value }))
              }
              placeholder="Example: PCM 92%, biology 88%, entrance rank 3210"
            />
          </label>
          <label>
            Short note about interests
            <textarea
              rows={3}
              value={form.bio}
              onChange={(event) =>
                setForm((current) => ({ ...current, bio: event.target.value }))
              }
              placeholder="Subjects you enjoy, preferred cities, career direction..."
            />
          </label>

          <div className="panel-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>

        <section className="panel top-gap">
          <div className="panel-head">
            <div>
              <h2>Academic Documents</h2>
              <p className="panel-note">
                Upload at least one 10th or 12th supporting document. PDF, JPG, PNG, and WEBP are
                accepted.
              </p>
            </div>
          </div>

          <form className="upload-strip" onSubmit={uploadDocument}>
            <select
              value={uploadForm.documentType}
              onChange={(event) =>
                setUploadForm((current) => ({ ...current, documentType: event.target.value }))
              }
            >
              {DOCUMENT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) =>
                setUploadForm((current) => ({
                  ...current,
                  file: event.target.files?.[0] || null
                }))
              }
            />
            <button type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload Document"}
            </button>
          </form>

          {documents.length === 0 ? (
            <p className="empty-copy">No academic documents uploaded yet.</p>
          ) : (
            <ul className="document-list top-gap">
              {documents.map((document) => (
                <li key={document.id}>
                  <div>
                    <strong>{document.document_type.replace(/_/g, " ")}</strong>
                    <span>{document.original_name}</span>
                  </div>
                  <div className="row-actions">
                    <a
                      className="text-link"
                      href={toAssetUrl(document.file_path)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      className="outline-btn"
                      onClick={() => deleteDocument(document.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
