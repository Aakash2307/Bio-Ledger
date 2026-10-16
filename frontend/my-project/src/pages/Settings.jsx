import React, { useState } from "react";
import "../css/Settings.css";

/**
 * BioLedger Settings — frontend-only UI.
 * Preferences are kept in React state and are not sent to a backend.
 */
export default function Settings() {
  const [activeSection, setActiveSection] = useState("Workspace");
  const [theme, setTheme] = useState("Light");
  const [density, setDensity] = useState("Comfortable");
  const [defaultView, setDefaultView] = useState("Dashboard");
  const [rowsPerPage, setRowsPerPage] = useState("25");
  const [fullName, setFullName] = useState("BioLedger User");
  const [email, setEmail] = useState("user@tzarlabs.com");
  const [department, setDepartment] = useState("Genomics");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pipelineNotifications, setPipelineNotifications] = useState(true);
  const [reportNotifications, setReportNotifications] = useState(true);
  const [securityNotifications, setSecurityNotifications] = useState(false);
  const [rememberSection, setRememberSection] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [saved, setSaved] = useState(false);

  const sections = [
    { name: "Profile", icon: "◉", description: "Your account information" },
    { name: "Appearance", icon: "◐", description: "Theme and display preferences" },
    { name: "Workspace", icon: "☷", description: "Default views and table settings" },
    { name: "Notifications", icon: "♧", description: "Choose what you hear about" },
  ];

  const isDark = theme === "Dark";
  const toggle = (checked, onChange, label) => (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={`settings-switch ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-thumb" />
    </button>
  );

  const resetPreview = () => {
    setTheme("Light");
    setDensity("Comfortable");
    setDefaultView("Dashboard");
    setRowsPerPage("25");
    setEmailNotifications(true);
    setPipelineNotifications(true);
    setReportNotifications(true);
    setSecurityNotifications(false);
    setRememberSection(true);
    setReduceMotion(false);
    setSaved(false);
  };

  const renderProfile = () => (
    <>
      <h2 className="settings-section-title">Profile &amp; account</h2>
      <p className="settings-section-description">
        Manage the personal information associated with your BioLedger account.
      </p>

      <div className="settings-profile-summary">
        <div className="settings-avatar">{(fullName.trim()[0] || "U").toUpperCase()}</div>
        <div>
          <p className="settings-profile-name">{fullName || "Your name"}</p>
          <p className="settings-profile-meta">{department} · BioLedger user</p>
        </div>
      </div>

      <div className="settings-field-grid">
        <label className="settings-field">
          <span className="settings-label">Full name</span>
          <input
            className="settings-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Enter your name"
          />
        </label>
        <label className="settings-field">
          <span className="settings-label">Email address</span>
          <input
            className="settings-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
          />
        </label>
        <label className="settings-field">
          <span className="settings-label">Department</span>
          <input
            className="settings-input"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="e.g. Genomics"
          />
        </label>
        <label className="settings-field">
          <span className="settings-label">Role</span>
          <input className="settings-input settings-readonly" value="Standard user" readOnly />
          <span className="settings-help">Role changes should be managed by an administrator.</span>
        </label>
      </div>

      <div className="settings-divider" />
      <div>
        <p className="settings-row-title">Password &amp; authentication</p>
        <p className="settings-row-description">
          Account security controls can be connected to your authentication system later.
        </p>
        <button
          type="button"
          className="settings-button settings-button-secondary settings-password-button"
          onClick={() => window.alert("Frontend demo only — password changes are not connected.")}
        >
          Change password
        </button>
      </div>
    </>
  );

  const renderAppearance = () => (
    <>
      <h2 className="settings-section-title">Appearance</h2>
      <p className="settings-section-description">
        Personalize the look and feel of your BioLedger workspace.
      </p>

      <div className="settings-row">
        <div>
          <p className="settings-row-title">Interface theme</p>
          <p className="settings-row-description">Choose a theme for this page.</p>
        </div>
        <select className="settings-select" value={theme} onChange={(event) => setTheme(event.target.value)}>
          <option>Light</option>
          <option>Dark</option>
          <option>System</option>
        </select>
      </div>

      <div className="settings-row">
        <div>
          <p className="settings-row-title">Table density</p>
          <p className="settings-row-description">Choose how much information appears in tables.</p>
        </div>
        <select className="settings-select" value={density} onChange={(event) => setDensity(event.target.value)}>
          <option>Comfortable</option>
          <option>Compact</option>
        </select>
      </div>

      <div className="settings-row">
        <div>
          <p className="settings-row-title">Reduce visual motion</p>
          <p className="settings-row-description">Use fewer transitions and animations where supported.</p>
        </div>
        {toggle(reduceMotion, setReduceMotion, "Reduce visual motion")}
      </div>

      <div className="settings-typography-preview">
        <p className="settings-preview-label">Typography preview</p>
        <p className="settings-preview-heading">EXOME Dashboard</p>
        <p className="settings-preview-description">
          Inter-style interface text · Clear, readable laboratory analytics
        </p>
      </div>
    </>
  );

  const renderWorkspace = () => (
    <>
      <h2 className="settings-section-title">Workspace preferences</h2>
      <p className="settings-section-description">
        Set your preferred starting point and information density.
      </p>

      <div className="settings-row">
        <div>
          <p className="settings-row-title">Default landing view</p>
          <p className="settings-row-description">Choose which section you prefer to open first.</p>
        </div>
        <select className="settings-select" value={defaultView} onChange={(event) => setDefaultView(event.target.value)}>
          <option>Dashboard</option>
          <option>Patients</option>
          <option>Samples</option>
          <option>Reports</option>
        </select>
      </div>

      <div className="settings-row">
        <div>
          <p className="settings-row-title">Rows per page</p>
          <p className="settings-row-description">Default number of records displayed in tables.</p>
        </div>
        <select className="settings-select" value={rowsPerPage} onChange={(event) => setRowsPerPage(event.target.value)}>
          <option value="10">10 rows</option>
          <option value="25">25 rows</option>
          <option value="50">50 rows</option>
          <option value="100">100 rows</option>
        </select>
      </div>

      <div className="settings-row">
        <div>
          <p className="settings-row-title">Remember last selected section</p>
          <p className="settings-row-description">A future integration can restore your last-used view.</p>
        </div>
        {toggle(rememberSection, setRememberSection, "Remember last selected section")}
      </div>

      <div className="settings-current-preview">
        <p className="settings-preview-label">Current preview</p>
        <p className="settings-current-preview-text">
          Landing view: <strong>{defaultView}</strong>
          <span className="settings-preview-separator">·</span>
          Table density: <strong>{density}</strong>
          <span className="settings-preview-separator">·</span>
          Rows: <strong>{rowsPerPage}</strong>
        </p>
      </div>
    </>
  );

  const renderNotifications = () => (
    <>
      <h2 className="settings-section-title">Notifications</h2>
      <p className="settings-section-description">
        Choose which updates you would like BioLedger to surface.
      </p>

      {[
        {
          title: "Email notifications",
          description: "Receive account and workspace updates by email.",
          value: emailNotifications,
          setter: setEmailNotifications,
        },
        {
          title: "Pipeline status",
          description: "Know when a processing job completes or fails.",
          value: pipelineNotifications,
          setter: setPipelineNotifications,
        },
        {
          title: "Report generation",
          description: "Get notified when a report is ready to review.",
          value: reportNotifications,
          setter: setReportNotifications,
        },
        {
          title: "Security alerts",
          description: "Receive alerts for sign-in and account security events.",
          value: securityNotifications,
          setter: setSecurityNotifications,
        },
      ].map((item) => (
        <div className="settings-row" key={item.title}>
          <div>
            <p className="settings-row-title">{item.title}</p>
            <p className="settings-row-description">{item.description}</p>
          </div>
          {toggle(item.value, item.setter, item.title)}
        </div>
      ))}

      <p className="settings-help settings-notification-note">
        These switches currently update only this page's local state. No notifications are sent.
      </p>
    </>
  );

  const contentBySection = {
    Profile: renderProfile,
    Appearance: renderAppearance,
    Workspace: renderWorkspace,
    Notifications: renderNotifications,
  };

  const saveChanges = () => {
    // Frontend-only demonstration: no API request and no persistent storage.
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  };

  return (
    <div className={`settings-page ${isDark ? "settings-theme-dark" : ""} ${reduceMotion ? "settings-reduce-motion" : ""}`}>
      <main className="settings-content">
        <div className="settings-page-heading">
          <h1 className="settings-page-title">Settings</h1>
          <p className="settings-page-subtitle">
            Manage your account, workspace preferences and notifications.
          </p>
        </div>

        <div className="settings-layout">
          <aside className="settings-panel settings-sidebar">
            <p className="settings-sidebar-eyebrow">Preferences</p>

            <nav className="settings-navigation" aria-label="Settings sections">
              {sections.map((section) => {
                const selected = activeSection === section.name;
                return (
                  <button
                    key={section.name}
                    type="button"
                    className={`settings-nav-button ${selected ? "is-active" : ""}`}
                    onClick={() => setActiveSection(section.name)}
                    aria-current={selected ? "page" : undefined}
                  >
                    <span className="settings-nav-icon" aria-hidden="true">{section.icon}</span>
                    <span className="settings-nav-copy">
                      <span className="settings-nav-name">{section.name}</span>
                      <span className="settings-nav-description">{section.description}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="settings-divider settings-sidebar-divider" />
            <div className="settings-sidebar-footer">
              <strong>BioLedger</strong>
              <span>Frontend settings preview</span>
            </div>
          </aside>

          <section className="settings-panel settings-main-panel">
            {contentBySection[activeSection]()}
            <div className="settings-footer">
              <span className={`settings-save-status ${saved ? "is-saved" : ""}`} role="status">
                {saved ? "✓ Changes applied in this preview" : "Changes are local to this page"}
              </span>
              <div className="settings-footer-actions">
                <button type="button" className="settings-button settings-button-secondary" onClick={resetPreview}>
                  Reset preview
                </button>
                <button type="button" className="settings-button settings-button-primary" onClick={saveChanges}>
                  Save changes
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}