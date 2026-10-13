// components/Layout.jsx
// Wraps all pages with a persistent sidebar.
// Individual pages only render their own content — no sidebar needed inside them.

import Sidebar from "../components/Sidebar";


export default function Layout({ children }) {

  const handleSignOut = () => {
    // Add your sign out logic here
    console.log("Sign out");
  };

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: "'Sora', 'Segoe UI', sans-serif",
      background: "#f5f7fa",
    }}>
      <Sidebar onSignOut={handleSignOut} />
      <main style={{ marginLeft: 220, flex: 1, padding: "40px" }}>
        {children}
      </main>
    </div>
  );
}
