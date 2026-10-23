import { useMemo, useState, useEffect, useCallback } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import DashboardPage from "./pages/DashboardPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import StudentProfileSetupPage from "./pages/StudentProfileSetupPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import UniversityProfileSetupPage from "./pages/UniversityProfileSetupPage.jsx";

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

const resolvePrivateRoute = (user) =>
  user && ["student", "university"].includes(user.role) && !user.profileComplete
    ? "/profile-setup"
    : "/dashboard";

/* ========================= */
/* 🎬 PAGE TRANSITION WRAPPER */
/* ========================= */
function AnimatedRoutes({ children }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-transition">
      {children}
    </div>
  );
}

export default function App() {

  /* ========================= */
  /* 🎬 CINEMATIC LOADER */
  /* ========================= */
  const [loading, setLoading] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 900);
    const remove = setTimeout(() => setLoading(false), 1500);

    return () => {
      clearTimeout(timer);
      clearTimeout(remove);
    };
  }, []);

  /* ========================= */
  /* 🎯 GLOBAL GLOW TRACK */
  /* ========================= */
  useEffect(() => {
    const move = (e) => {
      document.documentElement.style.setProperty("--x", e.clientX + "px");
      document.documentElement.style.setProperty("--y", e.clientY + "px");
    };

    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  /* ========================= */
  /* 💎 3D CARD EFFECT */
  /* ========================= */
  useEffect(() => {
    const cards = document.querySelectorAll(".landing-card");

    const handleMove = (card) => (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const rotateX = (y / rect.height - 0.5) * 10;
      const rotateY = (x / rect.width - 0.5) * -10;

      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    };

    const handleLeave = (card) => () => {
      card.style.transform =
        "perspective(800px) rotateX(0) rotateY(0) scale(1)";
    };

    cards.forEach((card) => {
      const move = handleMove(card);
      const leave = handleLeave(card);

      card.addEventListener("mousemove", move);
      card.addEventListener("mouseleave", leave);

      card._move = move;
      card._leave = leave;
    });

    return () => {
      cards.forEach((card) => {
        card.removeEventListener("mousemove", card._move);
        card.removeEventListener("mouseleave", card._leave);
      });
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
  const requiresUniversityProfile =
    Boolean(session?.token) &&
    session?.user?.role === "university" &&
    !session?.user?.profileComplete;
  const requiresProfileSetup = requiresStudentProfile || requiresUniversityProfile;

  const saveSession = useCallback((payload) => {
    const data = {
      token: payload.token,
      user: payload.user,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSession(data);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const updateSessionUser = useCallback((nextUser) => {
    setSession((current) => {
      if (!current?.token) return current;

      const nextSession = {
        ...current,
        user: nextUser,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      return nextSession;
    });
  }, []);

  /* ========================= */
  /* 🎬 LOADER */
  /* ========================= */
  if (loading) {
    return (
      <div
        className={`loader-screen ${fadeOut ? "fade-out" : ""}`}
        onMouseMove={(e) => {
          const x = e.clientX / window.innerWidth;
          const y = e.clientY / window.innerHeight;

          const logo = document.querySelector(".logo-text");
          if (logo) {
            logo.style.transform = `translate(${x * 20 - 10}px, ${y * 20 - 10}px)`;
          }
        }}
      >
        <div className="loader-content">

          <h1 className="logo-text">
            {"EDUVISTA".split("").map((letter, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.1}s` }}>
                {letter}
              </span>
            ))}
          </h1>

          <div className="loader-bar">
            <div className="loader-progress"></div>
          </div>

        </div>
      </div>
    );
  }

  /* ========================= */
  /* 🌐 ROUTES + TRANSITIONS */
  /* ========================= */
  return (
    <BrowserRouter>
      <AnimatedRoutes>
        <Routes>

          <Route
            path="/"
            element={
              <LandingPage
                isAuthenticated={Boolean(session)}
                currentUser={user}
                onLogout={clearSession}
              />
            }
          />

          <Route
            path="/login"
            element={
              session ? (
                <Navigate
                  to={resolvePrivateRoute(session.user)}
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
                  to={resolvePrivateRoute(session.user)}
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
                ) : session.user?.role === "university" ? (
                  <UniversityProfileSetupPage
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
                requiresProfileSetup ? (
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
      </AnimatedRoutes>
    </BrowserRouter>
  );
}
