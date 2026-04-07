// components/Sidebar.jsx
// Reads active route from useLocation — no props needed for active state.
// Props:
//   onSignOut (function) - callback when Sign Out clicked

import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png"; // Adjust the path as needed

const navItems = [
  { label: "Dashboard",  icon: "⊞", path: "/"           },
  { label: "Patients",   icon: "👤", path: "/patients"   },
  { label: "Sample Tracker",    icon: "🧪", path: "/samples"    },
  { label: "Sequencing analysis", icon: "〜", path: "/sequencing" },
  { label: "Reports",    icon: "📄", path: "/reports"    },
  { label: "Settings",   icon: "⚙",  path: "/settings"   },
];

export default function Sidebar({ onSignOut }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside style={{
      width: 220,
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      padding: "28px 0",
      position: "fixed",
      top: 0, left: 0,
      height: "100vh",
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: "0 24px 32px", display: "flex", alignItems: "center", gap: 10 }}>


                <div style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <img 
              src={logo}
              alt="logo"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        {/* <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#fff",
        }}>✦</div> */}
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>EXOME</span>
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 12px" }}>
        {navItems.map(({ label, icon, path }) => {
          // Exact match for Dashboard ("/"), startsWith for others
          const isActive = path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(path);

          return (
            <button
              key={label}
              onClick={() => navigate(path)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 10,
                background: isActive ? "rgba(59,130,246,0.2)" : "transparent",
                border: "none", cursor: "pointer",
                color: isActive ? "#93c5fd" : "#94a3b8",
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                textAlign: "left", transition: "all 0.15s",
                width: "100%",
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: 15 }}>{icon}</span>
              {label}
            </button>
          );
        })}
      </nav>

      {/* Sign Out */}
      <div style={{ padding: "12px 12px 0", marginBottom: "50px" }}>
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 12 }} />
        <button
          onClick={onSignOut}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(239,68,68,0.15)";
            e.currentTarget.style.color = "#fca5a5";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(239,68,68,0.08)";
            e.currentTarget.style.color = "#f87171";
          }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", width: "100%",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#f87171", fontSize: 13, fontWeight: 500,
            cursor: "pointer", borderRadius: 10,
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 15 }}>→</span> Sign Out
        </button>
      </div>
    </aside>
  );
}