import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SnakeBodyLogo from "./SnakeBodyLogo.jsx";

export default function Hub({ games }) {
  const navigate = useNavigate();
  const [showDrafts, setShowDrafts] = useState(false);
  const visibleGames = useMemo(
    () => games.filter((g) => g.status === "final" || (showDrafts && g.status === "draft")),
    [games, showDrafts]
  );

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100dvh",
        background: "var(--mg-color-background)",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Mono', 'Courier New', monospace",
        userSelect: "none",
        position: "relative",
        paddingTop: "32px",
        paddingBottom: "64px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeInDim {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 0.55; transform: translateY(0); }
        }

        .game-card {
          background: var(--mg-surface, #141928);
          border: 1px solid rgba(221, 225, 240, 0.12);
          color: var(--mg-color-text-primary);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 36px 48px;
          width: 180px;
          gap: 18px;
          transition: border-color 0.22s ease, background 0.22s ease, box-shadow 0.22s ease;
          animation: fadeIn 0.6s ease both;
        }
        .game-card:hover {
          border-color: var(--mg-accent-cyan, #00d4ff);
          background: rgba(0, 212, 255, 0.06);
          box-shadow: 0 0 22px rgba(0, 212, 255, 0.14), inset 0 0 0 1px rgba(0, 212, 255, 0.12);
        }
        .game-card:active {
          background: rgba(0, 212, 255, 0.10);
        }
        .game-card .card-icon {
          color: var(--mg-accent-cyan, #00d4ff);
          transition: color 0.2s;
        }
        .game-card:hover .card-icon {
          color: var(--mg-accent-purple, #9b59f5);
        }
        .hub-checkbox {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          margin: 0;
          border: 1px solid rgba(0, 212, 255, 0.45);
          background: transparent !important;
          display: grid;
          place-content: center;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .hub-checkbox:hover {
          border-color: var(--mg-accent-cyan, #00d4ff);
        }
        .hub-checkbox::before {
          content: "";
          width: 6px;
          height: 6px;
          transform: scale(0);
          transition: transform 0.12s ease;
          background: var(--mg-accent-cyan, #00d4ff);
        }
        .hub-checkbox:checked::before {
          transform: scale(1);
        }
        @media (max-width: 480px) {
          .game-card {
            padding: 20px 28px;
            width: 130px;
            gap: 12px;
          }
        }
      `}</style>

      {/* title */}
      <img
        src="/mgames/title.png"
        alt="mgames"
        style={{
          marginBottom: "clamp(24px, 5vw, 56px)",
          animation: "fadeInDim 0.5s ease forwards",
          maxWidth: "min(40vw, 320px)",
          filter: "brightness(1.8) saturate(0.4)",
        }}
      />

      {/* show draft toggle */}
      <label
        style={{
          marginBottom: 22,
          color: "var(--mg-color-text-medium)",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          display: "flex",
          gap: 8,
          alignItems: "center",
          cursor: "pointer",
          animation: "fadeIn 0.6s ease both",
        }}
      >
        <input
          type="checkbox"
          className="hub-checkbox"
          checked={showDrafts}
          onChange={(e) => setShowDrafts(e.target.checked)}
        />
        show draft games
      </label>

      {/* game cards grid */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {visibleGames.map((g, i) => (
          <button
            key={g.path}
            className="game-card"
            aria-label={`${g.name} game`}
            style={{ animationDelay: `${i * 0.12 + 0.1}s` }}
            onClick={() => navigate(g.path)}
          >
            <span
              className="card-icon"
              style={{
                minHeight: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {g.icon === "snake-body" ? (
                <SnakeBodyLogo />
              ) : (
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 300,
                    lineHeight: 1,
                  }}
                >
                  {g.symbol}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: 11,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "var(--mg-text, #dde1f0)",
                opacity: 0.88,
                fontWeight: 400,
              }}
            >
              {g.name}
            </span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: 1.5,
                color: "var(--mg-text-medium, rgba(221,225,240,0.62))",
                textAlign: "center",
                lineHeight: 1.7,
              }}
            >
              {g.description}
            </span>
          </button>
        ))}
      </div>

      {/* footer email */}
      <a
        href="mailto:daniele.olmisani@gmail.com"
        style={{
          marginTop: 40,
          color: "var(--mg-color-text-dim)",
          fontSize: 9,
          letterSpacing: 2,
          textDecoration: "none",
          fontFamily: "'DM Mono', 'Courier New', monospace",
          animation: "fadeIn 0.8s ease forwards",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mg-accent-cyan, #00d4ff)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mg-color-text-dim)")}
      >
        daniele.olmisani@gmail.com
      </a>
    </div>
  );
}
