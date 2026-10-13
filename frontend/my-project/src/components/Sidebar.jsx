// components/Sidebar.jsx
// Slide-in drawer. Hidden by default; Layout controls open/close.
// Props:
//   open      (boolean)  - whether the drawer is visible
//   onClose   (function) - called on backdrop click, collapse tab, or nav click
//   onSignOut (function) - called when the sign-out button is clicked
//   user      ({ name, role }) - shown in the footer card

import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { icons, navGroups } from "./navConfig";

const initials = (name = "") =>
  name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const css = `
.sb-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(8, 13, 28, 0.55);
  backdrop-filter: blur(3px);
  opacity: 0; visibility: hidden;
  transition: opacity .25s ease, visibility 0s linear .25s;
}
.sb-backdrop[data-open="true"] {
  opacity: 1; visibility: visible;
  transition: opacity .25s ease, visibility 0s;
}

.sb-drawer {
  position: fixed; top: 0; left: 0; z-index: 210;
  width: 276px; height: 100dvh;
  display: flex; flex-direction: column;
  background:
    radial-gradient(120% 55% at 0% 0%, rgba(59,130,246,0.16), transparent 60%),
    linear-gradient(180deg, #0c1426 0%, #0f172a 55%, #0b1222 100%);
  border-right: 1px solid rgba(255,255,255,0.07);
  box-shadow: 20px 0 60px rgba(2, 6, 23, 0.45);
  transform: translateX(-100%);
  visibility: hidden;
  transition: transform .3s cubic-bezier(.22,.8,.3,1), visibility 0s linear .3s;
}
.sb-drawer[data-open="true"] {
  transform: translateX(0);
  visibility: visible;
  transition: transform .3s cubic-bezier(.22,.8,.3,1), visibility 0s;
}

/* Brand */
.sb-head {
  display: flex; align-items: center; gap: 12px;
  padding: 24px 22px 20px;
}
.sb-mark {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 15px;
  box-shadow: 0 6px 18px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.3);
}
.sb-name {
  color: #fff; font-weight: 700; font-size: 15px; letter-spacing: .14em; line-height: 1.1;
}
.sb-sub { color: #64748b; font-size: 11.5px; margin-top: 3px; letter-spacing: .02em; }

/* Collapse tab on the drawer's edge */
.sb-collapse {
  position: absolute; top: 29px; right: -13px;
  width: 26px; height: 26px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: #1e293b; border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 2px 8px rgba(2, 6, 23, 0.4);
  color: #cbd5e1; cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
}
.sb-collapse:hover { background: #3b82f6; border-color: #3b82f6; color: #fff; }

/* Nav */
.sb-nav {
  flex: 1; overflow-y: auto; padding: 4px 12px 14px;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent;
}
.sb-group + .sb-group { margin-top: 20px; }
.sb-group-label {
  display: flex; align-items: center; gap: 10px;
  padding: 0 10px 8px;
  font-size: 10.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
  color: #52627a;
}
.sb-group-label::after {
  content: ""; flex: 1; height: 1px; background: rgba(255,255,255,0.06);
}

.sb-item {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 5px 10px 5px 5px; margin-bottom: 3px;
  border: 1px solid transparent; border-radius: 12px; cursor: pointer;
  background: transparent; color: #94a3b8;
  font-family: inherit; font-size: 13.5px; font-weight: 500; text-align: left;
  transition: background .15s, color .15s, border-color .15s;
}
.sb-tile {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.04); color: #94a3b8;
  transition: background .15s, color .15s, box-shadow .15s;
}
.sb-item:hover { background: rgba(255,255,255,0.04); color: #e2e8f0; }
.sb-item:hover .sb-tile { background: rgba(255,255,255,0.09); color: #e2e8f0; }

.sb-item[data-active="true"] {
  color: #e8f0ff; font-weight: 600;
  background: linear-gradient(90deg, rgba(59,130,246,0.18), rgba(59,130,246,0.04));
  border-color: rgba(96,165,250,0.18);
}
.sb-item[data-active="true"] .sb-tile {
  background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff;
  box-shadow: 0 4px 12px rgba(59,130,246,0.45), inset 0 1px 0 rgba(255,255,255,0.25);
}
.sb-item[data-active="true"]::before {
  content: ""; position: absolute; left: -12px; top: 11px; bottom: 11px;
  width: 3px; border-radius: 0 3px 3px 0; background: #60a5fa;
  box-shadow: 0 0 12px rgba(96,165,250,0.7);
}

/* Staggered entrance when the drawer opens */
.sb-drawer[data-open="true"] .sb-item {
  animation: sbIn .35s cubic-bezier(.22,.8,.3,1) both;
  animation-delay: calc(var(--i) * 32ms + 90ms);
}
@keyframes sbIn {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Footer user card */
.sb-foot { padding: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
.sb-user {
  display: flex; align-items: center; gap: 11px;
  padding: 10px; border-radius: 12px;
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(255,255,255,0.06);
}
.sb-avatar {
  width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .02em;
}
.sb-user-meta { flex: 1; min-width: 0; }
.sb-user-name {
  color: #e2e8f0; font-size: 13px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sb-user-role { color: #64748b; font-size: 11.5px; margin-top: 1px; }
.sb-signout {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer; color: #94a3b8;
  transition: background .15s, color .15s;
}
.sb-signout:hover { background: rgba(239,68,68,0.15); color: #fca5a5; }

.sb-item:focus-visible, .sb-collapse:focus-visible, .sb-signout:focus-visible {
  outline: 2px solid #60a5fa; outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .sb-backdrop, .sb-drawer { transition: none !important; }
  .sb-drawer[data-open="true"] .sb-item { animation: none; }
}
`;

export default function Sidebar({
  open,
  onClose,
  onSignOut,
  user = { name: "Lab User", role: "Analyst" },
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const closeRef = useRef(null);

  // Move focus into the drawer when it opens.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const go = (path) => {
    navigate(path);
    onClose();
  };

  let index = 0;

  return (
    <>
      <style>{css}</style>

      <div className="sb-backdrop" data-open={open} onClick={onClose} aria-hidden="true" />

      <aside
        className="sb-drawer"
        data-open={open}
        id="app-sidebar"
        aria-label="Main navigation"
      >
        <div className="sb-head">
          <div className="sb-mark">✦</div>
          <div>
            <div className="sb-name">EXOME</div>
            <div className="sb-sub">BioLedger</div>
          </div>
        </div>

        <button
          ref={closeRef}
          className="sb-collapse"
          onClick={onClose}
          aria-label="Close menu"
          title="Close menu"
        >
          {icons.chevronLeft}
        </button>

        <nav className="sb-nav">
          {navGroups.map((group) => (
            <div className="sb-group" key={group.label}>
              <div className="sb-group-label">{group.label}</div>
              {group.items.map(({ label, icon, path }) => {
                const isActive =
                  path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(path);
                const i = index++;
                return (
                  <button
                    key={label}
                    className="sb-item"
                    style={{ "--i": i }}
                    data-active={isActive}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => go(path)}
                  >
                    <span className="sb-tile">{icon}</span>
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">
            <div className="sb-avatar">{initials(user.name)}</div>
            <div className="sb-user-meta">
              <div className="sb-user-name">{user.name}</div>
              <div className="sb-user-role">{user.role}</div>
            </div>
            <button
              className="sb-signout"
              onClick={() => {
                onClose();
                onSignOut();
              }}
              aria-label="Sign out"
              title="Sign out"
            >
              {icons.signout}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}