const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);

const fetchWithTimeout = async (path, options = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out. Check that the backend is running and responsive.");
    }
    if (error instanceof TypeError) {
      throw new Error("Cannot reach the backend. Check that the API server is running.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const parseError = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error || payload?.message || "Request failed. Please try again.";
    const error = new Error(message);
    if (payload?.details) {
      error.details = payload.details;
    }
    if (payload?.missingPrerequisites) {
      error.missingPrerequisites = payload.missingPrerequisites;
    }
    if (payload?.conflictWith) {
      error.conflictWith = payload.conflictWith;
    }
    throw error;
  }

  return payload;
};

const withQuery = (path, query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
};

const request = async (path, { token, method = "GET", body, headers } = {}) => {
  const response = await fetchWithTimeout(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  return parseError(response);
};

const requestRaw = async (path, { token, method = "GET", body } = {}) => {
  const response = await fetchWithTimeout(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || payload.message || "Request failed.");
  }

  return response;
};

const requestForm = async (path, { token, method = "POST", formData } = {}) => {
  const response = await fetchWithTimeout(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  return parseError(response);
};

export const api = {
  captcha: () => request("/auth/captcha"),
  signupMeta: () => request("/auth/signup-meta"),
  signup: (payload) => request("/auth/signup", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  logout: (token) => request("/auth/logout", { token, method: "POST" }),
  me: (token) => request("/auth/me", { token }),
  profile: (token) => request("/auth/profile", { token }),
  updateProfile: (token, payload) =>
    request("/auth/profile", { token, method: "PUT", body: payload }),
  uploadStudentDocument: (token, { documentType, academicLevel, file }) => {
    const formData = new FormData();
    formData.append("documentType", documentType);
    if (academicLevel) {
      formData.append("academicLevel", academicLevel);
    }
    formData.append("file", file);
    return requestForm("/auth/profile/documents", { token, formData });
  },
  deleteStudentDocument: (token, documentId) =>
    request(`/auth/profile/documents/${documentId}`, {
      token,
      method: "DELETE"
    }),

  courseMeta: (token) => request("/courses/meta", { token }),
  listCourses: (token, filters = {}) =>
    request(withQuery("/courses", filters), { token }),
  registrationWindow: (token) => request("/courses/registration-window", { token }),
  myEnrollments: (token) => request("/courses/my", { token }),
  previewRegistration: (token, courseId) =>
    request("/courses/preview", {
      token,
      method: "POST",
      body: { courseId }
    }),
  holdSeat: (token, courseId) =>
    request("/courses/hold", {
      token,
      method: "POST",
      body: { courseId }
    }),
  registerCourse: (token, courseId, holdReference) =>
    request("/courses/register", {
      token,
      method: "POST",
      body: { courseId, holdReference }
    }),
  dropCourse: (token, courseId) =>
    request(`/courses/register/${courseId}`, {
      token,
      method: "DELETE"
    }),
  switchSection: (token, fromCourseId, toCourseId) =>
    request("/courses/switch-section", {
      token,
      method: "POST",
      body: { fromCourseId, toCourseId }
    }),
  waitlist: (token) => request("/courses/waitlist", { token }),
  applicationStatus: (token, applicationId) =>
    request(`/courses/status/${applicationId}`, { token }),
  timetable: (token) => request("/courses/timetable", { token }),
  alternatives: (token, courseId) => request(`/courses/alternatives/${courseId}`, { token }),
  progress: (token) => request("/courses/progress", { token }),
  planner: (token) => request("/courses/planner", { token }),
  addPlan: (token, payload) =>
    request("/courses/planner", { token, method: "POST", body: payload }),
  removePlan: (token, planId) =>
    request(`/courses/planner/${planId}`, { token, method: "DELETE" }),
  createRequest: (token, payload) =>
    request("/courses/requests", { token, method: "POST", body: payload }),
  myRequests: (token) => request("/courses/requests/my", { token }),
  submitReview: (token, payload) =>
    request("/courses/reviews", { token, method: "POST", body: payload }),
  courseReviews: (token, courseId) => request(`/courses/reviews/${courseId}`, { token }),
  popularity: (token) => request("/courses/popularity", { token }),
  announcements: (token) => request("/courses/announcements", { token }),

  notifications: (token, query = {}) =>
    request(withQuery("/notifications", query), { token }),
  markNotificationRead: (token, id) =>
    request(`/notifications/${id}/read`, { token, method: "PATCH" }),
  markAllNotificationsRead: (token) =>
    request("/notifications/read-all", { token, method: "PATCH" }),
  paymentConfirmation: (token, payload) =>
    request("/notifications/payment-confirmation", {
      token,
      method: "POST",
      body: payload
    }),
  paymentProvider: (token) => request("/payments/provider", { token }),
  paymentIntent: (token, payload) =>
    request("/payments/intent", {
      token,
      method: "POST",
      body: payload
    }),
  confirmPayment: (token, payload) =>
    request("/payments/confirm", {
      token,
      method: "POST",
      body: payload
    }),
  myPayments: (token) => request("/payments/my", { token }),

  applicationMeta: (token) => request("/applications/meta", { token }),
  applicationCatalog: (token, filters = {}) =>
    request(withQuery("/applications/catalog", filters), { token }),
  myCourseApplications: (token) => request("/applications/my", { token }),
  applicationDetails: (token, applicationId) =>
    request(`/applications/${applicationId}`, { token }),
  submitApplication: (token, payload) =>
    request("/applications", { token, method: "POST", body: payload }),
  uploadApplicationDocument: (token, applicationId, { requirementName, file }) => {
    const formData = new FormData();
    formData.append("requirementName", requirementName);
    formData.append("file", file);
    return requestForm(`/applications/${applicationId}/documents`, {
      token,
      formData
    });
  },
  deleteApplicationDocument: (token, documentId) =>
    request(`/applications/documents/${documentId}`, {
      token,
      method: "DELETE"
    }),

  universityDashboard: (token) => request("/university/dashboard", { token }),
  universityCourses: (token) => request("/university/courses", { token }),
  createUniversityCourse: (token, payload) =>
    request("/university/courses", { token, method: "POST", body: payload }),
  updateUniversityCourse: (token, courseId, payload) =>
    request(`/university/courses/${courseId}`, {
      token,
      method: "PUT",
      body: payload
    }),
  deleteUniversityCourse: (token, courseId) =>
    request(`/university/courses/${courseId}`, {
      token,
      method: "DELETE"
    }),
  uploadUniversityAsset: (token, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return requestForm("/university/assets", { token, formData });
  },
  courseRequirements: (token, courseId) =>
    request(`/university/courses/${courseId}/requirements`, { token }),
  addCourseRequirement: (token, courseId, payload) =>
    request(`/university/courses/${courseId}/requirements`, {
      token,
      method: "POST",
      body: payload
    }),
  deleteCourseRequirement: (token, requirementId) =>
    request(`/university/requirements/${requirementId}`, {
      token,
      method: "DELETE"
    }),
  universityApplications: (token) => request("/university/applications", { token }),
  reviewUniversityApplication: (token, applicationId, status) =>
    request(`/university/applications/${applicationId}`, {
      token,
      method: "PATCH",
      body: { status }
    }),

  facultyDashboard: (token) => request("/faculty/dashboard", { token }),
  facultyCourses: (token) => request("/faculty/courses", { token }),
  facultyReviews: (token, courseId) => request(`/faculty/courses/${courseId}/reviews`, { token }),
  facultyFeedback: (token, reviewId, facultyFeedback) =>
    request(`/faculty/reviews/${reviewId}/feedback`, {
      token,
      method: "PATCH",
      body: { facultyFeedback }
    }),
  advisorRequests: (token) => request("/faculty/requests", { token }),
  advisorDecision: (token, requestId, action) =>
    request(`/faculty/requests/${requestId}`, {
      token,
      method: "PATCH",
      body: { action }
    }),

  adminUsers: (token, query = {}) => request(withQuery("/admin/users", query), { token }),
  adminDepartments: (token) => request("/admin/departments", { token }),
  createDepartment: (token, payload) =>
    request("/admin/departments", { token, method: "POST", body: payload }),
  updateDepartment: (token, id, payload) =>
    request(`/admin/departments/${id}`, { token, method: "PUT", body: payload }),
  deleteDepartment: (token, id) =>
    request(`/admin/departments/${id}`, { token, method: "DELETE" }),

  adminSemesters: (token) => request("/admin/semesters", { token }),
  createSemester: (token, payload) =>
    request("/admin/semesters", { token, method: "POST", body: payload }),
  updateSemester: (token, id, payload) =>
    request(`/admin/semesters/${id}`, { token, method: "PUT", body: payload }),

  adminCourses: (token, query = {}) => request(withQuery("/admin/courses", query), { token }),
  createCourse: (token, payload) =>
    request("/admin/courses", { token, method: "POST", body: payload }),
  updateCourse: (token, id, payload) =>
    request(`/admin/courses/${id}`, { token, method: "PUT", body: payload }),
  deleteCourse: (token, id) => request(`/admin/courses/${id}`, { token, method: "DELETE" }),
  setSeatLimit: (token, id, seatsTotal) =>
    request(`/admin/courses/${id}/seat-limit`, {
      token,
      method: "PATCH",
      body: { seatsTotal }
    }),
  assignFaculty: (token, id, facultyId) =>
    request(`/admin/courses/${id}/assign-faculty`, {
      token,
      method: "PATCH",
      body: { facultyId }
    }),

  bulkRegisterCore: (token, payload) =>
    request("/admin/courses/bulk-register-core", {
      token,
      method: "POST",
      body: payload
    }),

  freezeStatus: (token) => request("/admin/registration/freeze", { token }),
  setFreezeStatus: (token, frozen) =>
    request("/admin/registration/freeze", {
      token,
      method: "POST",
      body: { frozen }
    }),

  adminAnnouncements: (token) => request("/admin/announcements", { token }),
  postAnnouncement: (token, payload) =>
    request("/admin/announcements", { token, method: "POST", body: payload }),

  adminRequests: (token, query = {}) =>
    request(withQuery("/admin/requests", query), { token }),
  adminDecision: (token, requestId, action) =>
    request(`/admin/requests/${requestId}`, {
      token,
      method: "PATCH",
      body: { action }
    }),

  analyticsOverview: (token) => request("/admin/analytics/overview", { token }),
  analyticsDepartments: (token) => request("/admin/analytics/departments", { token }),
  analyticsPopular: (token) => request("/admin/analytics/popular-courses", { token }),
  analyticsTrends: (token) => request("/admin/analytics/trends", { token }),

  exportReport: (token, format) =>
    requestRaw(withQuery("/admin/reports/export", { format }), {
      token
    })
};
