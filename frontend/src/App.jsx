import { useMemo, useState, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import StudentProfileSetupPage from "./pages/StudentProfileSetupPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";

const STORAGE_KEY = "eduvista_session";

const readSession = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
};

export default function App() {
  /* ========================= */
  /* 🎯 CUSTOM CURSOR SETUP */
  /* ========================= */
  useEffect(() => {
    const cursor = document.createElement("div");
    cursor.classList.add("custom-cursor");

    const ring = document.createElement("div");
    ring.classList.add("cursor-ring");

    document.body.appendChild(cursor);
    document.body.appendChild(ring);

    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;

    const speed = 0.15;

    const move = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      cursor.style.left = mouseX + "px";
      cursor.style.top = mouseY + "px";
    };

    const animate = () => {
      ringX += (mouseX - ringX) * speed;
      ringY += (mouseY - ringY) * speed;

      ring.style.left = ringX + "px";
      ring.style.top = ringY + "px";

      requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", move);
    animate();

    return () => {
      window.removeEventListener("mousemove", move);
      cursor.remove();
      ring.remove();
    };
  }, []);

  /* ========================= */
  /* 🔐 SESSION LOGIC */
  /* ========================= */
  const [session, setSession] = useState(readSession);

  const user = useMemo(() => session?.user || null, [session]);

  const requiresStudentProfile =
    Boolean(session?.token) &&
    session?.user?.role === "student" &&
    !session?.user?.profileComplete;

  const saveSession = (payload) => {
    const data = {
      token: payload.token,
      user: payload.user,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSession(data);
  };

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  };

  const updateSessionUser = (nextUser) => {
    setSession((current) => {
      if (!current?.token) return current;

      const nextSession = {
        ...current,
        user: nextUser,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      return nextSession;
    });
  };

  /* ========================= */
  /* 🌐 ROUTES */
  /* ========================= */
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              isAuthenticated={Boolean(session)}
              currentUser={user}
            />
          }
        />

        <Route
          path="/login"
          element={
            session ? (
              <Navigate
                to={requiresStudentProfile ? "/profile-setup" : "/dashboard"}
                replace
              />
            ) : (
              <LoginPage onAuthSuccess={saveSession} />
            )
          }
        />

        <Route
          path="/signup"
          element={
            session ? (
              <Navigate
                to={requiresStudentProfile ? "/profile-setup" : "/dashboard"}
                replace
              />
            ) : (
              <SignupPage onAuthSuccess={saveSession} />
            )
          }
        />

        <Route
          path="/profile-setup"
          element={
            session ? (
              session.user?.role === "student" ? (
                <StudentProfileSetupPage
                  token={session.token}
                  currentUser={user}
                  onSessionUserUpdate={updateSessionUser}
                  onLogout={clearSession}
                />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/dashboard"
          element={
            session ? (
              requiresStudentProfile ? (
                <Navigate to="/profile-setup" replace />
              ) : (
                <DashboardPage
                  token={session.token}
                  currentUser={user}
                  onLogout={clearSession}
                  onSessionUserUpdate={updateSessionUser}
                />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
