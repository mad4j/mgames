import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/* ═══════════════════════ CONSTANTS ════════════════════ */
const CODE_LENGTH  = 4;
const NUM_COLORS   = 6;
const MAX_ATTEMPTS = 10;

const C_BG   = "#0a0a0a";
const C_MAIN = "rgba(255,255,255,0.88)";
const mono   = "'DM Mono', 'Courier New', monospace";

const COLORS = [
  "#6ea8fe", // blue
  "#f47e7e", // red
  "#ffd77e", // yellow
  "#7ef4a2", // green
  "#d47ef4", // purple
  "#f4b07e", // orange
];

/* ═══════════════════════ GAME LOGIC ════════════════════ */
function generateSecret() {
  return Array.from({ length: CODE_LENGTH }, () =>
    Math.floor(Math.random() * NUM_COLORS)
  );
}

function evaluateGuess(secret, guess) {
  let blacks = 0;
  let whites = 0;
  const secretLeft = [];
  const guessLeft  = [];

  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === secret[i]) {
      blacks++;
    } else {
      secretLeft.push(secret[i]);
      guessLeft.push(guess[i]);
    }
  }

  for (const color of guessLeft) {
    const idx = secretLeft.indexOf(color);
    if (idx !== -1) {
      whites++;
      secretLeft.splice(idx, 1);
    }
  }

  return { blacks, whites };
}

function initGame() {
  return {
    secret:       generateSecret(),
    guesses:      [],
    currentGuess: Array(CODE_LENGTH).fill(null),
    won:          false,
  };
}

/* ═══════════════════════ META ══════════════════════════ */
export const meta = {
  path:        "/mastermind",
  symbol:      "◉",
  name:        "mastermind",
  description: "crack the hidden color code",
};

/* ═══════════════════════ COMPONENT ════════════════════ */
export default function MastermindGame() {
  const navigate = useNavigate();

  const [phase,         setPhase]         = useState("idle");
  const [game,          setGame]          = useState(null);
  const [selectedColor, setSelectedColor] = useState(0);

  /* ── keyboard: Enter to submit ──────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── start / restart ─────────────────────────────────── */
  const start = useCallback(() => {
    setGame(initGame());
    setSelectedColor(0);
    setPhase("playing");
  }, []);

  /* ── place selected color in a slot ─────────────────── */
  const handleSlotClick = useCallback(
    (slotIndex) => {
      setGame((prev) => {
        if (!prev || prev.won || prev.guesses.length >= MAX_ATTEMPTS) return prev;
        const newGuess = [...prev.currentGuess];
        newGuess[slotIndex] = selectedColor;
        return { ...prev, currentGuess: newGuess };
      });
    },
    [selectedColor]
  );

  /* ── submit current guess ────────────────────────────── */
  const handleSubmit = useCallback(() => {
    setGame((prev) => {
      if (!prev || prev.won || prev.guesses.length >= MAX_ATTEMPTS) return prev;
      if (prev.currentGuess.some((c) => c === null)) return prev;

      const { blacks, whites } = evaluateGuess(prev.secret, prev.currentGuess);
      const won       = blacks === CODE_LENGTH;
      const newGuesses = [
        ...prev.guesses,
        { colors: [...prev.currentGuess], blacks, whites },
      ];
      const lost = !won && newGuesses.length >= MAX_ATTEMPTS;

      if (won || lost) {
        setTimeout(() => setPhase("done"), won ? 500 : 200);
      }

      return {
        ...prev,
        guesses:      newGuesses,
        currentGuess: Array(CODE_LENGTH).fill(null),
        won,
      };
    });
  }, []);

  /* ═══════════════════════ RENDER HELPERS ════════════════ */

  const canSubmit =
    phase === "playing" &&
    game &&
    !game.won &&
    game.guesses.length < MAX_ATTEMPTS &&
    game.currentGuess.every((c) => c !== null);

  /* ── single peg circle ───────────────────────────────── */
  const Peg = ({ colorIndex, size = 24, faded = false, clickable = false, onClick }) => (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        width:        size,
        height:       size,
        borderRadius: "50%",
        background:   colorIndex !== null ? COLORS[colorIndex] : "transparent",
        border:       `1.5px solid ${colorIndex !== null ? COLORS[colorIndex] : "rgba(255,255,255,0.18)"}`,
        boxSizing:    "border-box",
        opacity:      faded ? 0.22 : 1,
        cursor:       clickable ? "pointer" : "default",
        flexShrink:   0,
        transition:   "opacity 0.15s",
      }}
    />
  );

  /* ── 2×2 feedback dots ───────────────────────────────── */
  const FeedbackGrid = ({ blacks, whites }) => {
    const pegs = [
      ...Array(blacks).fill("black"),
      ...Array(whites).fill("white"),
      ...Array(CODE_LENGTH - blacks - whites).fill("empty"),
    ];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
        {pegs.map((p, i) => (
          <div
            key={i}
            style={{
              width:        8,
              height:       8,
              borderRadius: "50%",
              background:   p === "black" ? "rgba(255,255,255,0.88)" : "transparent",
              border:       `1px solid ${p === "empty" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.88)"}`,
              boxSizing:    "border-box",
            }}
          />
        ))}
      </div>
    );
  };

  /* ── one guess row ───────────────────────────────────── */
  const GuessRow = ({ index, colors, blacks, whites, isCurrent, isEmpty }) => {
    const faded   = isEmpty;
    const opacity = isEmpty ? 0.18 : isCurrent ? 1 : 0.72;

    return (
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        10,
          opacity,
          transition: "opacity 0.2s",
        }}
      >
        {/* row number */}
        <div
          style={{
            width:     16,
            textAlign: "right",
            color:     C_MAIN,
            fontSize:  8,
            opacity:   0.3,
          }}
        >
          {index + 1}
        </div>

        {/* peg slots */}
        <div
          style={{
            display:    "flex",
            gap:        7,
            padding:    "3px 6px",
            border:     isCurrent ? "1px solid rgba(255,255,255,0.22)" : "1px solid transparent",
            transition: "border-color 0.2s",
          }}
        >
          {Array(CODE_LENGTH)
            .fill(null)
            .map((_, j) => (
              <Peg
                key={j}
                colorIndex={colors ? colors[j] : null}
                size={22}
                faded={faded}
                clickable={isCurrent}
                onClick={() => handleSlotClick(j)}
              />
            ))}
        </div>

        {/* feedback */}
        <div style={{ width: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!isCurrent && !isEmpty && (
            <FeedbackGrid blacks={blacks} whites={whites} />
          )}
        </div>
      </div>
    );
  };

  /* ── full board (all 10 rows) ────────────────────────── */
  const Board = () => {
    const numGuesses = game?.guesses.length ?? 0;
    const isPlaying  = phase === "playing" && game && !game.won;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {Array(MAX_ATTEMPTS)
          .fill(null)
          .map((_, i) => {
            if (i < numGuesses) {
              const g = game.guesses[i];
              return (
                <GuessRow
                  key={i}
                  index={i}
                  colors={g.colors}
                  blacks={g.blacks}
                  whites={g.whites}
                  isCurrent={false}
                  isEmpty={false}
                />
              );
            }
            if (i === numGuesses && isPlaying) {
              return (
                <GuessRow
                  key={i}
                  index={i}
                  colors={game.currentGuess}
                  blacks={0}
                  whites={0}
                  isCurrent={true}
                  isEmpty={false}
                />
              );
            }
            return (
              <GuessRow
                key={i}
                index={i}
                colors={null}
                blacks={0}
                whites={0}
                isCurrent={false}
                isEmpty={true}
              />
            );
          })}
      </div>
    );
  };

  /* ── shared button ───────────────────────────────────── */
  const Btn = ({ onClick, disabled, children, style }) => (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        background:    "transparent",
        border:        "1px solid rgba(255,255,255,0.27)",
        color:         C_MAIN,
        fontFamily:    mono,
        fontSize:      11,
        letterSpacing: 5,
        padding:       "12px 32px",
        cursor:        disabled ? "default" : "pointer",
        textTransform: "uppercase",
        opacity:       disabled ? 0.28 : 1,
        transition:    "border-color 0.2s, box-shadow 0.2s, opacity 0.2s",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = C_MAIN;
          e.currentTarget.style.boxShadow  = "0 0 18px rgba(255,255,255,0.18)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.27)";
        e.currentTarget.style.boxShadow  = "none";
      }}
    >
      {children}
    </button>
  );

  /* ── hub icon button ─────────────────────────────────── */
  const HubBtn = () => (
    <button
      aria-label="back to hub"
      onClick={() => navigate("/")}
      onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.38)")}
      style={{
        position:   "absolute",
        top:        14,
        right:      12,
        zIndex:     20,
        background: "transparent",
        border:     "none",
        color:      "rgba(255,255,255,0.38)",
        cursor:     "pointer",
        padding:    6,
        lineHeight: 0,
        transition: "color 0.2s",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2"  y="2"  width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <rect x="10" y="2"  width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <rect x="2"  y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <rect x="10" y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    </button>
  );

  /* ══════════════════════════════════════════════════════ */
  return (
    <div
      style={{
        width:           "100vw",
        height:          "100dvh",
        background:      C_BG,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
      }}
    >
      <div
        style={{
          position:      "relative",
          width:         430,
          height:        760,
          maxWidth:      "calc(100vw - 32px)",
          maxHeight:     "calc(100dvh - 32px)",
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          justifyContent:"center",
          fontFamily:    mono,
          userSelect:    "none",
          outline:       "1px dashed rgba(255,255,255,0.12)",
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
          @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        <HubBtn />

        {/* ── IDLE ──────────────────────────────────────── */}
        {phase === "idle" && (
          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           0,
              animation:     "fadeIn 0.55s ease",
            }}
          >
            <div
              style={{
                color:         C_MAIN,
                fontSize:      10,
                letterSpacing: 8,
                marginBottom:  20,
                opacity:       0.38,
                textTransform: "uppercase",
              }}
            >
              — logic game —
            </div>

            <div
              style={{
                color:         C_MAIN,
                fontSize:      42,
                letterSpacing: 12,
                lineHeight:    1,
                textShadow:    `0 0 28px ${C_MAIN}`,
                marginBottom:  6,
              }}
            >
              MASTER
            </div>
            <div
              style={{
                color:         C_MAIN,
                fontSize:      42,
                letterSpacing: 12,
                lineHeight:    1,
                textShadow:    `0 0 28px ${C_MAIN}`,
                marginBottom:  16,
              }}
            >
              MIND
            </div>

            <div
              style={{
                color:         C_MAIN,
                fontSize:      9,
                letterSpacing: 3,
                opacity:       0.28,
                marginBottom:  36,
              }}
            >
              crack the hidden color code
            </div>

            {/* color preview */}
            <div style={{ display: "flex", gap: 7, marginBottom: 36 }}>
              {COLORS.map((c, i) => (
                <div
                  key={i}
                  style={{
                    width:        14,
                    height:       14,
                    borderRadius: "50%",
                    background:   c,
                    opacity:      0.6,
                  }}
                />
              ))}
            </div>

            {/* rules */}
            <div style={{ display: "flex", gap: 28, marginBottom: 4 }}>
              {[
                ["COLORS", "6 to choose"],
                ["CODE",   "4 pegs"],
                ["TRIES",  `${MAX_ATTEMPTS} attempts`],
              ].map(([k, v]) => (
                <div key={k} style={{ textAlign: "center" }}>
                  <div style={{ color: C_MAIN, fontSize: 9, letterSpacing: 3, opacity: 0.55 }}>{k}</div>
                  <div style={{ color: C_MAIN, fontSize: 9, letterSpacing: 1, opacity: 0.2, marginTop: 3 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* legend */}
            <div
              style={{
                display:       "flex",
                gap:           20,
                marginTop:     20,
                marginBottom:  0,
              }}
            >
              {[
                ["●", "right color & place"],
                ["○", "right color, wrong place"],
              ].map(([sym, label]) => (
                <div key={sym} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width:        8,
                      height:       8,
                      borderRadius: "50%",
                      background:   sym === "●" ? "rgba(255,255,255,0.88)" : "transparent",
                      border:       "1px solid rgba(255,255,255,0.88)",
                      boxSizing:    "border-box",
                    }}
                  />
                  <div style={{ color: C_MAIN, fontSize: 8, letterSpacing: 1, opacity: 0.25 }}>{label}</div>
                </div>
              ))}
            </div>

            <Btn onClick={start} style={{ marginTop: 44 }}>
              play
            </Btn>
          </div>
        )}

        {/* ── PLAYING ───────────────────────────────────── */}
        {phase === "playing" && game && (
          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           14,
              animation:     "fadeIn 0.4s ease",
              width:         "100%",
              padding:       "0 24px",
              boxSizing:     "border-box",
            }}
          >
            {/* attempt counter */}
            <div
              style={{
                color:         C_MAIN,
                fontSize:      9,
                letterSpacing: 4,
                opacity:       0.35,
                textTransform: "uppercase",
              }}
            >
              attempt {game.guesses.length + 1} / {MAX_ATTEMPTS}
            </div>

            <Board />

            {/* color palette */}
            <div style={{ display: "flex", gap: 9, marginTop: 4 }}>
              {COLORS.map((color, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedColor(i)}
                  style={{
                    width:        30,
                    height:       30,
                    borderRadius: "50%",
                    background:   color,
                    cursor:       "pointer",
                    border:       `2px solid ${selectedColor === i ? "rgba(255,255,255,0.9)" : "transparent"}`,
                    boxSizing:    "border-box",
                    opacity:      selectedColor === i ? 1 : 0.5,
                    transition:   "opacity 0.15s, border-color 0.15s",
                    boxShadow:    selectedColor === i ? `0 0 10px ${color}` : "none",
                  }}
                />
              ))}
            </div>

            {/* submit */}
            <Btn onClick={handleSubmit} disabled={!canSubmit}>
              submit
            </Btn>
          </div>
        )}

        {/* ── DONE ──────────────────────────────────────── */}
        {phase === "done" && game && (
          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              animation:     "fadeIn 0.5s ease",
            }}
          >
            <div style={{ width: 48, height: 1, background: C_MAIN, opacity: 0.35, marginBottom: 24 }} />

            <div
              style={{
                color:         C_MAIN,
                fontSize:      11,
                letterSpacing: 6,
                textTransform: "uppercase",
                opacity:       0.5,
                marginBottom:  20,
              }}
            >
              {game.won ? "cracked it" : "code broken"}
            </div>

            {/* revealed secret */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {game.secret.map((colorIdx, i) => (
                <div
                  key={i}
                  style={{
                    width:        28,
                    height:       28,
                    borderRadius: "50%",
                    background:   COLORS[colorIdx],
                    boxShadow:    `0 0 10px ${COLORS[colorIdx]}`,
                  }}
                />
              ))}
            </div>

            {game.won ? (
              <div
                style={{
                  color:         C_MAIN,
                  fontSize:      9,
                  letterSpacing: 3,
                  opacity:       0.38,
                  marginBottom:  20,
                }}
              >
                solved in {game.guesses.length}{" "}
                {game.guesses.length === 1 ? "attempt" : "attempts"}
              </div>
            ) : (
              <div
                style={{
                  color:         C_MAIN,
                  fontSize:      9,
                  letterSpacing: 3,
                  opacity:       0.28,
                  marginBottom:  20,
                }}
              >
                better luck next time
              </div>
            )}

            <div style={{ width: 48, height: 1, background: C_MAIN, opacity: 0.35, marginBottom: 16 }} />

            {/* compact game history */}
            <div
              style={{
                display:       "flex",
                flexDirection: "column",
                gap:           5,
                marginBottom:  20,
                maxHeight:     320,
                overflowY:     "auto",
              }}
            >
              {game.guesses.map((g, i) => (
                <div
                  key={i}
                  style={{
                    display:    "flex",
                    gap:        8,
                    alignItems: "center",
                    opacity:    game.won && i === game.guesses.length - 1 ? 1 : 0.55,
                  }}
                >
                  <div
                    style={{
                      width:     14,
                      textAlign: "right",
                      color:     C_MAIN,
                      fontSize:  8,
                      opacity:   0.3,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {g.colors.map((c, j) => (
                      <div
                        key={j}
                        style={{
                          width:        16,
                          height:       16,
                          borderRadius: "50%",
                          background:   COLORS[c],
                        }}
                      />
                    ))}
                  </div>
                  <FeedbackGrid blacks={g.blacks} whites={g.whites} />
                </div>
              ))}
            </div>

            <Btn onClick={start}>again</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
