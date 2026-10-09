// components/Layout.jsx
// Wraps all pages. The sidebar is a drawer that opens from the menu button
// in the top bar. Individual pages only render their own content.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar, { navItems } from "../components/Sidebar";

const css = `
.lt-topbar {
  position: sticky; top: 0; z-index: 50;
  height: 56px; padding: 0 24px;
  display: flex; align-items: center; gap: 14px;
  background: rgba(245, 247, 250, 0.88);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e3e8ef;
}
.lt-menu {
  width: 36px; height: 36px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #fff; border: 1px solid #dde3ec; color: #0f172a;
  cursor: pointer; transition: background .15s, border-color .15s;
}
.lt-menu:hover { background: #eef2f7; border-color: #cbd5e1; }
.lt-menu:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
.lt-sep { width: 1px; height: 20px; background: #dde3ec; }
.lt-title { font-size: 14px; font-weight: 600; color: #0f172a; }
`;

// Longest matching nav path wins, so "/sequencing/report-automation"
// shows "Sequencing analysis" and "/" only matches the dashboard exactly.
function titleFor(pathname) {
  let best = null;
  for (const item of navItems) {
    const match =
      item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
    if (match && (!best || item.path.length > best.path.length)) best = item;
  }
  return best ? best.label : "EXOME";
}

// TODO: replace with the real logged-in user from your auth/state.
const user = { name: "Lab User", role: "Analyst" };

export default function Layout({ children }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const wasOpen = useRef(false);

  const handleSignOut = () => {
    // Add your sign out logic here
    console.log("Sign out");
  };

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Return focus to the menu button after the drawer closes.
  useEffect(() => {
    if (wasOpen.current && !open) menuRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "'Sora', 'Segoe UI', sans-serif",
        background: "#f5f7fa",
      }}
    >
      <style>{css}</style>

      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        onSignOut={handleSignOut}
        user={user}
      />

      <header className="lt-topbar">
        <button
          ref={menuRef}
          className="lt-menu"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        <span className="lt-sep" />
        <span className="lt-title">{titleFor(location.pathname)}</span>
      </header>

      <main style={{ padding: "32px 40px" }}>{children}</main>
    </div>
  );
}