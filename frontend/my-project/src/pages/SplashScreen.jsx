// src/pages/SplashScreen.jsx
import { useEffect, useState } from "react";
import logo from "../assets/biologo.png";

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState("enter");
  const [showLogo, setShowLogo] = useState(false);

  useEffect(() => {
    const logoTimer = setTimeout(() => setShowLogo(true), 2000);
    const exitTimer = setTimeout(() => setPhase("exit"), 6200);
    const doneTimer = setTimeout(() => onDone(), 7100);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const textVisible = showLogo;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: phase === "exit" ? 0 : 1,
        transition: phase === "exit" ? "opacity 0.9s ease" : "none",
      }}
    >
      {/* Main lockup */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        
        {/* Logo */}
        <div
          style={{
            width: 110,
            height: 110,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={logo}
            alt="BioLedger Logo"
            style={{
              width: 110,
              height: 110,
              objectFit: "contain",
              opacity: showLogo ? 1 : 0.4, // 👈 darker initial visibility
              transform: showLogo ? "scale(1)" : "scale(0.92)",
              filter: showLogo ? "brightness(1)" : "brightness(0.7)", // 👈 makes it feel darker
              transition:
                "opacity 0.6s ease, transform 0.6s cubic-bezier(0.22,1,0.36,1), filter 0.6s ease",
            }}
          />
        </div>

        {/* Text */}
        <div
          style={{
            overflow: "hidden",
            maxWidth: textVisible ? "600px" : "0px",
            opacity: textVisible ? 1 : 0,
            transition:
              "max-width 0.85s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.55s ease 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontSize: 72,
              fontWeight: 700,
              color: "#0f172a", // 👈 navy match
              letterSpacing: "-1.5px",
              paddingLeft: 22,
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              lineHeight: 1,
            }}
          >
            BioLedger
          </span>
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: 28,
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.7s ease 0.7s, transform 0.7s ease 0.7s",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 18,
            color: "#64748b",
            fontWeight: 400,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "'Segoe UI', system-ui, sans-serif",
          }}
        >
          Genomics · Patient Management · Analytics
        </p>
      </div>

      {/* Underline */}
      <div
        style={{
          marginTop: 36,
          width: textVisible ? 320 : 0,
          height: 2,
          borderRadius: 2,
          background: "linear-gradient(90deg, #0f172a, #3b82f6)", // 👈 aligned with navy + dashboard blue
          transition:
            "width 1s cubic-bezier(0.22, 1, 0.36, 1) 0.5s",
        }}
      />

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          opacity: textVisible ? 0.45 : 0,
          transition: "opacity 0.8s ease 1.2s",
          fontSize: 13,
          color: "#64748b",
          letterSpacing: "0.08em",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        Powered by TZAR Labs
      </div>
    </div>
  );
}