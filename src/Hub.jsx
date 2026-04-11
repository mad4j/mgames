import { useNavigate } from "react-router-dom";

const GAMES = [
  {
    path: "/tap",
    symbol: "●",
    name: "tap",
    description: "pop the dots before they vanish",
  },
  {
    path: "/void",
    symbol: "△",
    name: "void",
    description: "navigate the asteroid field",
  },
];

export default function Hub() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        background: "#0a0a0a",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Mono', 'Courier New', monospace",
        userSelect: "none",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .game-card {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 36px 48px;
          width: 180px;
          gap: 18px;
          transition: border-color 0.2s ease, background 0.2s ease;
          animation: fadeIn 0.6s ease both;
        }
        .game-card:hover {
          border-color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.03);
        }
        .game-card:active {
          background: rgba(255,255,255,0.06);
        }
      `}</style>

      {/* title */}
      <div
        style={{
          color: "#fff",
          fontSize: 10,
          letterSpacing: 6,
          opacity: 0.22,
          textTransform: "uppercase",
          marginBottom: 56,
          animation: "fadeIn 0.5s ease",
        }}
      >
        mgames
      </div>

      {/* game cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {GAMES.map((g, i) => (
          <button
            key={g.path}
            className="game-card"
            style={{ animationDelay: `${i * 0.12 + 0.1}s` }}
            onClick={() => navigate(g.path)}
          >
            <span
              style={{
                fontSize: 32,
                fontWeight: 300,
                lineHeight: 1,
                opacity: 0.85,
              }}
            >
              {g.symbol}
            </span>
            <span
              style={{
                fontSize: 10,
                letterSpacing: 5,
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              {g.name}
            </span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: 1.5,
                opacity: 0.22,
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              {g.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
