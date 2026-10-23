import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(
  /\/api$/,
  ""
);

const toAssetUrl = (filePath) => {
  if (!filePath) return "";
  if (filePath.startsWith("http")) return filePath;
  return `${API_ORIGIN}${filePath}`;
};

const DOCUMENT_TYPES = [
  { value: "marksheet", label: "10th / 12th Marksheet" },
  { value: "certificate", label: "Passing Certificate" },
  { value: "id_proof", label: "ID Proof" },
  { value: "transfer_certificate", label: "Transfer Certificate" },
  { value: "other", label: "Other" }
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
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
  const [step, setStep] = useState(1); // 1 = Personal, 2 = Academic, 3 = Documents
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

  const completionPercent = useMemo(() => {
    const checks = [
      Boolean(form.fullName),
      Boolean(form.phone),
      Boolean(form.guardianPhone),
      Boolean(form.academicLevel),
      Boolean(form.schoolName),
      Boolean(form.boardName),
      Boolean(form.city && form.state),
      Boolean(form.scorePercent),
      documents.length > 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form, documents.length]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const [profileResult, meResult] = await Promise.all([api.profile(token), api.me(token)]);
      onSessionUserUpdate(meResult.user);
      setProfileReady(Boolean(meResult.user.profileComplete));
      setDocuments(profileResult.documents || []);
      setForm({
        fullName: profileResult.profile?.full_name || meResult.user.name || "",
        academicLevel: profileResult.profile?.academic_level || meResult.user.academicLevel || "12",
        phone: profileResult.profile?.phone || meResult.user.phone || "",
        guardianPhone: profileResult.profile?.guardian_phone || meResult.user.guardianPhone || "",
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
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!error) return undefined;
    const timeout = window.setTimeout(() => setError(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const saveProfile = async (event) => {
    if (event) event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.updateProfile(token, form);
      const meResult = await api.me(token);
      onSessionUserUpdate(meResult.user);
      const isComplete = Boolean(meResult.user.profileComplete);
      setProfileReady(isComplete);
      setNotice("Profile saved successfully!");
      return isComplete;
    } catch (requestError) {
      setError(requestError.message || "Unable to save profile.");
      return false;
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
      setNotice("Document uploaded successfully!");
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
    return (
      <div className="cool-auth-bg">
        <div className="cool-auth-orb cool-auth-orb-1" />
        <div className="cool-auth-orb cool-auth-orb-2" />
        <div className="cool-auth-orb cool-auth-orb-3" />
        <p style={{ color: "#94a3b8", textAlign: "center", paddingTop: "40vh", fontSize: "1.1rem" }}>
          Preparing your profile...
        </p>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "Personal" },
    { num: 2, label: "Academic" },
    { num: 3, label: "Documents" }
  ];

  return (
    <div className="cool-auth-bg">
      <div className="cool-auth-orb cool-auth-orb-1" />
      <div className="cool-auth-orb cool-auth-orb-2" />
      <div className="cool-auth-orb cool-auth-orb-3" />

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

      <main style={{
        position: "relative", zIndex: 1,
        maxWidth: 720, margin: "0 auto",
        padding: "2rem 1.5rem 4rem",
        minHeight: "100vh"
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: "2rem"
        }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#818cf8", marginBottom: "0.3rem"
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)"
              }} />
              Student Onboarding
            </div>
            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem",
              fontWeight: 700, color: "#f8fafc", margin: 0, lineHeight: 1.2
            }}>
              Complete your profile
            </h1>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={onLogout}
              style={{
                all: "unset", cursor: "pointer", padding: "0.5rem 1rem",
                borderRadius: "0.65rem", fontSize: "0.82rem", fontWeight: 700,
                color: "#94a3b8", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)", transition: "all 0.2s"
              }}
            >
              Logout
            </button>
            <button
              type="button"
              disabled={!profileReady && completionPercent !== 100}
              onClick={async () => {
                const complete = await saveProfile();
                if (complete) navigate("/dashboard", { replace: true });
              }}
              style={{
                all: "unset", cursor: (profileReady || completionPercent === 100) ? "pointer" : "not-allowed",
                padding: "0.5rem 1.2rem", borderRadius: "0.65rem",
                fontSize: "0.82rem", fontWeight: 700, color: "#fff",
                background: (profileReady || completionPercent === 100)
                  ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                  : "rgba(99,102,241,0.3)",
                opacity: (profileReady || completionPercent === 100) ? 1 : 0.5, transition: "all 0.2s"
              }}
            >
              Open Dashboard →
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          padding: "1.25rem 1.5rem", borderRadius: "1rem",
          background: "rgba(15,23,42,0.6)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.06)", marginBottom: "1.5rem"
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "0.6rem"
          }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1" }}>
              Profile completion
            </span>
            <span style={{
              fontSize: "0.82rem", fontWeight: 800,
              color: completionPercent === 100 ? "#34d399" : "#818cf8"
            }}>
              {completionPercent}%
            </span>
          </div>
          <div style={{
            height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)",
            overflow: "hidden"
          }}>
            <div style={{
              height: "100%", borderRadius: 99,
              width: `${completionPercent}%`,
              background: completionPercent === 100
                ? "linear-gradient(90deg, #10b981, #34d399)"
                : "linear-gradient(90deg, #6366f1, #8b5cf6)",
              transition: "width 0.5s ease"
            }} />
          </div>
        </div>

        {/* Step tabs */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem",
          marginBottom: "1.5rem"
        }}>
          {steps.map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              style={{
                all: "unset", cursor: "pointer", textAlign: "center",
                padding: "0.75rem 0.5rem", borderRadius: "0.85rem",
                fontSize: "0.88rem", fontWeight: 700,
                color: step === s.num ? "#f1f5f9" : "#64748b",
                background: step === s.num
                  ? "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.12))"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${step === s.num ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.06)"}`,
                transition: "all 0.25s ease"
              }}
            >
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: "50%", marginRight: "0.4rem",
                fontSize: "0.72rem", fontWeight: 800,
                background: step === s.num ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)",
                color: step === s.num ? "#c7d2fe" : "#64748b"
              }}>
                {s.num}
              </span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <div style={{
            padding: "1.5rem", borderRadius: "1.2rem",
            background: "rgba(15,23,42,0.6)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.06)"
          }}>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem",
              color: "#f1f5f9", margin: "0 0 0.3rem"
            }}>
              Personal Information
            </h2>
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1.25rem" }}>
              Basic details for your student profile.
            </p>

            <div className="cool-dash-form">
              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>Full name *</label>
                  <input value={form.fullName} onChange={(e) => setForm(c => ({ ...c, fullName: e.target.value }))} required />
                </div>
                <div className="cool-dash-form-group">
                  <label>Academic level *</label>
                  <select value={form.academicLevel} onChange={(e) => setForm(c => ({ ...c, academicLevel: e.target.value }))}>
                    <option value="10">10th</option>
                    <option value="12">12th</option>
                  </select>
                </div>
              </div>

              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>Student phone *</label>
                  <input value={form.phone} onChange={(e) => setForm(c => ({ ...c, phone: e.target.value }))} required />
                </div>
                <div className="cool-dash-form-group">
                  <label>Parent phone *</label>
                  <input value={form.guardianPhone} onChange={(e) => setForm(c => ({ ...c, guardianPhone: e.target.value }))} required />
                </div>
              </div>

              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>City *</label>
                  <input value={form.city} onChange={(e) => setForm(c => ({ ...c, city: e.target.value }))} required />
                </div>
                <div className="cool-dash-form-group">
                  <label>State *</label>
                  <select value={form.state} onChange={(e) => setForm(c => ({ ...c, state: e.target.value }))} required>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.5rem", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  className="cool-dash-submit"
                  style={{ width: "auto", padding: "0.7rem 2rem", background: "rgba(99, 102, 241, 0.2)", color: "#818cf8", boxShadow: "none" }}
                >
                  {saving ? "Saving..." : "💾 Save"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await saveProfile();
                    setStep(2);
                  }}
                  className="cool-dash-submit"
                  style={{ width: "auto", padding: "0.7rem 2rem" }}
                >
                  Next: Academic Details →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Academic Info */}
        {step === 2 && (
          <div style={{
            padding: "1.5rem", borderRadius: "1.2rem",
            background: "rgba(15,23,42,0.6)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.06)"
          }}>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem",
              color: "#f1f5f9", margin: "0 0 0.3rem"
            }}>
              Academic Details
            </h2>
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1.25rem" }}>
              School and exam information for course matching.
            </p>

            <form className="cool-dash-form" onSubmit={saveProfile}>
              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>School name *</label>
                  <input value={form.schoolName} onChange={(e) => setForm(c => ({ ...c, schoolName: e.target.value }))} required />
                </div>
                <div className="cool-dash-form-group">
                  <label>Board *</label>
                  <input value={form.boardName} onChange={(e) => setForm(c => ({ ...c, boardName: e.target.value }))} placeholder="CBSE, State Board, ICSE..." required />
                </div>
              </div>

              <div className="cool-dash-form-row">
                <div className="cool-dash-form-group">
                  <label>Percentage / Score *</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.scorePercent} onChange={(e) => setForm(c => ({ ...c, scorePercent: e.target.value }))} required />
                </div>
                <div className="cool-dash-form-group">
                  <label>Stream</label>
                  <input value={form.streamName} onChange={(e) => setForm(c => ({ ...c, streamName: e.target.value }))} placeholder="Science, Commerce, Humanities..." />
                </div>
              </div>

              <div className="cool-dash-form-group">
                <label>Marks summary</label>
                <textarea rows={2} value={form.marksSummary} onChange={(e) => setForm(c => ({ ...c, marksSummary: e.target.value }))} placeholder="e.g. PCM 92%, Biology 88%, entrance rank 3210" />
              </div>

              <div className="cool-dash-form-group">
                <label>Course interest</label>
                <input value={form.targetCourse} onChange={(e) => setForm(c => ({ ...c, targetCourse: e.target.value }))} placeholder="Engineering, Medicine, Commerce..." />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={async () => {
                    await saveProfile();
                    setStep(1);
                  }}
                  style={{
                    all: "unset", cursor: "pointer", padding: "0.7rem 1.5rem",
                    borderRadius: "0.85rem", fontSize: "0.88rem", fontWeight: 700,
                    color: "#94a3b8", background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)"
                  }}
                >
                  ← Back
                </button>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button type="submit" disabled={saving} className="cool-dash-submit" style={{ width: "auto", padding: "0.7rem 2rem", background: "rgba(99, 102, 241, 0.2)", color: "#818cf8", boxShadow: "none" }}>
                    {saving ? "Saving..." : "💾 Save"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await saveProfile();
                      setStep(3);
                    }}
                    className="cool-dash-submit"
                    style={{ width: "auto", padding: "0.7rem 2rem" }}
                  >
                    Next: Documents →
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Step 3: Documents */}
        {step === 3 && (
          <div style={{
            padding: "1.5rem", borderRadius: "1.2rem",
            background: "rgba(15,23,42,0.6)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.06)"
          }}>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem",
              color: "#f1f5f9", margin: "0 0 0.3rem"
            }}>
              Academic Documents
            </h2>
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1.25rem" }}>
              Upload at least one 10th or 12th supporting document. PDF, JPG, PNG, and WEBP accepted.
            </p>

            <form className="cool-dash-form" onSubmit={uploadDocument}>
              <div className="cool-dash-form-row" style={{ alignItems: "flex-end" }}>
                <div className="cool-dash-form-group">
                  <label>Document type</label>
                  <select
                    value={uploadForm.documentType}
                    onChange={(e) => setUploadForm(c => ({ ...c, documentType: e.target.value }))}
                  >
                    {DOCUMENT_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div className="cool-dash-form-group">
                  <label>File</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setUploadForm(c => ({ ...c, file: e.target.files?.[0] || null }))}
                    style={{ padding: "0.55rem 0.9rem" }}
                  />
                </div>
              </div>
              <button type="submit" disabled={uploading} className="cool-dash-submit">
                {uploading ? "Uploading..." : "📄 Upload Document"}
              </button>
            </form>

            {/* Uploaded documents list */}
            {documents.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "2rem", color: "#64748b", fontSize: "0.88rem",
                marginTop: "1rem"
              }}>
                <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>📁</span>
                No documents uploaded yet.
              </div>
            ) : (
              <ul className="cool-dash-req-list" style={{ marginTop: "1.25rem" }}>
                {documents.map((doc) => (
                  <li key={doc.id} className="cool-dash-req-item">
                    <div>
                      <strong style={{ color: "#e2e8f0", fontFamily: "Manrope, sans-serif", fontSize: "0.85rem", textTransform: "capitalize" }}>
                        {doc.document_type.replace(/_/g, " ")}
                      </strong>
                      <small style={{ color: "#64748b", display: "block", marginTop: "0.1rem" }}>{doc.original_name}</small>
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <a
                        href={toAssetUrl(doc.file_path)}
                        target="_blank"
                        rel="noreferrer"
                        className="cool-dash-btn-sm inspect"
                        style={{ textDecoration: "none" }}
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        className="cool-dash-btn-sm delete"
                        onClick={() => deleteDocument(doc.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "1rem", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{
                  all: "unset", cursor: "pointer", padding: "0.7rem 1.5rem",
                  borderRadius: "0.85rem", fontSize: "0.88rem", fontWeight: 700,
                  color: "#94a3b8", background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)"
                }}
              >
                ← Back
              </button>
              
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  className="cool-dash-submit"
                  style={{ width: "auto", padding: "0.7rem 2rem", background: "rgba(99, 102, 241, 0.2)", color: "#818cf8", boxShadow: "none" }}
                >
                  {saving ? "Saving..." : "💾 Save"}
                </button>
                {(profileReady || completionPercent === 100) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const complete = await saveProfile();
                      if (complete) navigate("/dashboard", { replace: true });
                    }}
                    className="cool-dash-submit"
                    style={{ width: "auto", padding: "0.7rem 2rem" }}
                  >
                    ✅ Open Dashboard
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
