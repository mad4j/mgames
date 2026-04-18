import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ═══════════════════════ CONSTANTS ════════════════════ */
const CODE_LENGTH  = 4;
const NUM_SHAPES   = 6;
const MAX_ATTEMPTS = 10;
const ROW_INDEX_WIDTH = 20;
const FEEDBACK_COL_WIDTH = 36;
const SHAPE_DIAMOND_INDEX = 3;
const HUB_ICON_SLOT_SCALE = 0.4;
const HUB_ICON_GAP_SCALE = 0.06;
const HUB_ICON_SYMBOL_SCALE = 0.4;
const HUB_ICON_DIAMOND_SCALE = 1.1;
const TAP_HINT_BOTTOM_SPACING = 24;

const C_BG   = "#0a0a0a";
const C_MAIN = "rgba(255,255,255,0.95)";
const C_STRONG = "rgba(255,255,255,0.96)";
const C_SOFT = "rgba(255,255,255,0.78)";
const C_DIM = "rgba(255,255,255,0.42)";
const C_FAINT = "rgba(255,255,255,0.28)";
const C_BORDER = "rgba(255,255,255,0.28)";
const mono   = "'DM Mono', 'Courier New', monospace";
const IDLE_RULES = [
  ["SHAPES", "6 to choose"],
  ["CODE", "4 pegs"],
  ["TRIES", `${MAX_ATTEMPTS} attempts`],
];
const FEEDBACK_LEGEND = [
  ["●", "right shape & place"],
  ["○", "right shape, wrong place"],
];

/* ═══════════════════════ SHAPES ════════════════════════ */
// Returns SVG child elements for the given shape index.
// cx/cy = centre, r = radius of bounding circle
function ShapeElement({ index, cx, cy, r, fill, stroke = "none", strokeWidth = 0 }) {
  switch (index) {
    case 0: // circle
      return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case 1: // square
      return (
        <rect
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case 2: // triangle
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case SHAPE_DIAMOND_INDEX: // diamond
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case 4: { // pentagon
      const pts = Array.from({ length: 5 }, (_, i) => {
        const angle = (i * (2 * Math.PI) / 5) - Math.PI / 2;
        const radius = r;
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
      }).join(" ");
      return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    }
    case 5: { // hexagon
      const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (i * Math.PI / 3) - Math.PI / 6;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      }).join(" ");
      return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    }
    default:
      return null;
  }
}

/* ═══════════════════════ GAME LOGIC ════════════════════ */
function generateSecret() {
  return Array.from({ length: CODE_LENGTH }, () =>
    Math.floor(Math.random() * NUM_SHAPES)
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

/* ═══════════════════════ AUDIO ═════════════════════════ */
function useSound() {
  const ctxRef = useRef(null);
  const enabledRef = useRef(true);
  const [soundOn, _setSoundOn] = useState(true);

  const setSoundOn = useCallback((v) => {
    enabledRef.current = v;
    _setSoundOn(v);
  }, []);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playTone = useCallback((freq, duration, type = "sine", gainVal = 0.12) => {
    if (!enabledRef.current) return;
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) { /* ignore AudioContext errors */ }
  }, [getCtx]);

  const playPick = useCallback(() => {
    playTone(660, 0.06, "triangle", 0.08);
  }, [playTone]);

  const playSubmit = useCallback(() => {
    playTone(820, 0.08, "sine", 0.12);
    setTimeout(() => playTone(980, 0.08, "sine", 0.1), 45);
  }, [playTone]);

  const playWin = useCallback(() => {
    playTone(784, 0.12, "sine", 0.12);
    setTimeout(() => playTone(988, 0.14, "sine", 0.11), 80);
    setTimeout(() => playTone(1318, 0.2, "sine", 0.1), 160);
  }, [playTone]);

  const playLose = useCallback(() => {
    playTone(170, 0.35, "sawtooth", 0.14);
    setTimeout(() => playTone(120, 0.35, "triangle", 0.11), 120);
  }, [playTone]);

  return { soundOn, setSoundOn, playPick, playSubmit, playWin, playLose };
}

/* ═══════════════════════ META ══════════════════════════ */
function MastermindHubSymbol({ size = 32 }) {
  const slot = size * HUB_ICON_SLOT_SCALE;
  const gap = size * HUB_ICON_GAP_SCALE;
  const start = (size - (slot * 2 + gap)) / 2;
  const coords = [
    [start, start],
    [start + slot + gap, start],
    [start, start + slot + gap],
    [start + slot + gap, start + slot + gap],
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      style={{ display: "block" }}
      aria-hidden="true"
      focusable="false"
    >
      {coords.map(([x, y], i) => (
        <ShapeElement
          key={i}
          index={i}
          cx={x + slot / 2}
          cy={y + slot / 2}
          r={slot * HUB_ICON_SYMBOL_SCALE * (i === SHAPE_DIAMOND_INDEX ? HUB_ICON_DIAMOND_SCALE : 1)}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

function IconSound({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="2,6 6,6 10,2 10,16 6,12 2,12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
      {on ? (
        <>
          <path d="M12.5 6.5 C13.8 7.3 13.8 10.7 12.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
          <path d="M14.5 4.5 C17 6 17 12 14.5 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
        </>
      ) : (
        <>
          <line x1="12" y1="6" x2="17" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="17" y1="6" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </>
      )}
    </svg>
  );
}

export const meta = {
  path:        "/mastermind",
  symbol:      <MastermindHubSymbol />,
  name:        "mastermind",
  description: "crack the hidden shape code",
};

/* ═══════════════════════ COMPONENT ════════════════════ */
export default function MastermindGame() {
  const navigate   = useNavigate();
  const doneTimerRef = useRef(null);
  const { soundOn, setSoundOn, playPick, playSubmit, playWin, playLose } = useSound();

  const [phase,         setPhase]         = useState("idle");
  const [game,          setGame]          = useState(null);

  /* ── start / restart ─────────────────────────────────── */
  const start = useCallback(() => {
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
    setGame(initGame());
    setPhase("playing");
  }, []);

  /* ── tap slot to cycle through shapes ───────────────── */
  const handleSlotClick = useCallback(
    (slotIndex) => {
      setGame((prev) => {
        if (!prev || prev.won || prev.guesses.length >= MAX_ATTEMPTS) return prev;
        const newGuess = [...prev.currentGuess];
        const current = newGuess[slotIndex];
        newGuess[slotIndex] = current === null ? 0 : (current + 1) % NUM_SHAPES;
        return { ...prev, currentGuess: newGuess };
      });
    },
    []
  );

  /* ── submit current guess ────────────────────────────── */
  const handleSubmit = useCallback(() => {
    let didSubmit = false;
    let wonNow = false;
    let lostNow = false;

    setGame((prev) => {
      if (!prev || prev.won || prev.guesses.length >= MAX_ATTEMPTS) return prev;
      if (prev.currentGuess.some((c) => c === null)) return prev;
      didSubmit = true;

      const { blacks, whites } = evaluateGuess(prev.secret, prev.currentGuess);
      const won        = blacks === CODE_LENGTH;
      const newGuesses = [
        ...prev.guesses,
        { colors: [...prev.currentGuess], blacks, whites },
      ];
      const lost = !won && newGuesses.length >= MAX_ATTEMPTS;
      wonNow = won;
      lostNow = lost;

      if (won || lost) {
        doneTimerRef.current = setTimeout(() => {
          doneTimerRef.current = null;
          setPhase("done");
        }, won ? 500 : 200);
      }

      return {
        ...prev,
        guesses:      newGuesses,
        currentGuess: [...prev.currentGuess],
        won,
      };
    });
    if (!didSubmit) return;
    playSubmit();
    if (wonNow) setTimeout(playWin, 80);
    if (lostNow) setTimeout(playLose, 80);
  }, [playSubmit, playWin, playLose]);

  /* ── keyboard: Enter to submit ──────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSubmit]);

  /* ── cleanup on unmount ──────────────────────────────── */
  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const prevThemeColor = themeMeta?.getAttribute("content") ?? null;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;

    if (themeMeta) themeMeta.setAttribute("content", C_BG);
    document.documentElement.style.backgroundColor = C_BG;
    document.body.style.backgroundColor = C_BG;

    return () => {
      if (themeMeta && prevThemeColor !== null) {
        themeMeta.setAttribute("content", prevThemeColor);
      }
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  /* ═══════════════════════ RENDER HELPERS ════════════════ */

  const canSubmit =
    phase === "playing" &&
    game &&
    !game.won &&
    game.guesses.length < MAX_ATTEMPTS &&
    game.currentGuess.every((c) => c !== null);

  /* ── single shape peg ───────────────────────────────── */
  const Peg = ({ shapeIndex, size = 24, faded = false, clickable = false, onClick }) => {
    const cx = size / 2;
    const cy = size / 2;
    const r  = size / 2 - 2;
    return (
      <div
        onClick={clickable ? onClick : undefined}
        style={{
          width:      size,
          height:     size,
          opacity:    faded ? 0.22 : 1,
          cursor:     clickable ? "pointer" : "default",
          flexShrink: 0,
          transition: "opacity 0.15s",
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {shapeIndex !== null ? (
            <ShapeElement
              index={shapeIndex}
              cx={cx}
              cy={cy}
              r={r}
              fill={C_MAIN}
            />
          ) : (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="transparent"
              stroke={C_BORDER}
              strokeWidth={1.5}
            />
          )}
        </svg>
      </div>
    );
  };

  /* ── 2×2 feedback dots ───────────────────────────────── */
  const FeedbackGrid = ({ blacks, whites, dotSize = 9, gap = 4 }) => {
    const pegs = [
      ...Array(blacks).fill("black"),
      ...Array(whites).fill("white"),
      ...Array(CODE_LENGTH - blacks - whites).fill("empty"),
    ];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap }}>
        {pegs.map((p, i) => (
          <div
            key={i}
            style={{
              width:        dotSize,
              height:       dotSize,
              borderRadius: "50%",
              background:   p === "black" ? C_MAIN : "transparent",
              border:       `1px solid ${p === "empty" ? C_FAINT : C_MAIN}`,
              boxSizing:    "border-box",
            }}
          />
        ))}
      </div>
    );
  };

  /* ── submit icon in feedback slot ────────────────────── */
  const SubmitHintIcon = ({ enabled, onClick }) => (
    <button
      aria-label="submit guess"
      onClick={enabled ? onClick : undefined}
      style={{
        width:        28,
        height:       28,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        background:   "transparent",
        border:       `1px solid ${enabled ? C_SOFT : C_BORDER}`,
        borderRadius: 6,
        color:        enabled ? C_STRONG : C_DIM,
        cursor:       enabled ? "pointer" : "default",
        opacity:      enabled ? 1 : 0.75,
        transition:   "border-color 0.2s, box-shadow 0.2s, color 0.2s, opacity 0.2s",
      }}
      onMouseEnter={(e) => {
        if (enabled) {
          e.currentTarget.style.borderColor = C_STRONG;
          e.currentTarget.style.boxShadow = "0 0 12px rgba(255,255,255,0.26)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = enabled ? C_SOFT : C_BORDER;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M7 2v9M3 7l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  /* ── one guess row ───────────────────────────────────── */
  const GuessRow = ({ index, colors, blacks, whites, isCurrent, isEmpty }) => {
    const faded   = isEmpty;
    const opacity = isEmpty ? 0.18 : isCurrent ? 1 : 0.72;

    return (
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        12,
          opacity,
          transition: "opacity 0.2s",
        }}
      >
        {/* row number */}
        <div
          style={{
             width:     ROW_INDEX_WIDTH,
             textAlign: "right",
             color:     C_MAIN,
             fontSize:  10,
             opacity:   0.38,
           }}
        >
          {index + 1}
        </div>

        {/* peg slots */}
        <div
          style={{
             display:    "flex",
              gap:        9,
              padding:    "6px 12px",
             border:     isCurrent ? `1px solid ${C_BORDER}` : "1px solid transparent",
             transition: "border-color 0.2s",
            }}
        >
          {Array(CODE_LENGTH)
            .fill(null)
            .map((_, j) => (
               <Peg
                 key={j}
                  shapeIndex={colors ? colors[j] : null}
                   size={34}
                  faded={faded}
                  clickable={isCurrent}
                  onClick={() => {
                    handleSlotClick(j);
                    playPick();
                  }}
               />
            ))}
        </div>

        {/* feedback */}
        <div style={{ width: FEEDBACK_COL_WIDTH, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!isCurrent && !isEmpty && (
            <FeedbackGrid blacks={blacks} whites={whites} />
          )}
          {isCurrent && !isEmpty && (
            <SubmitHintIcon enabled={canSubmit} onClick={handleSubmit} />
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
      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           7,
          width:         "100%",
        }}
      >
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
        border:        `1px solid ${C_DIM}`,
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
          e.currentTarget.style.borderColor = C_STRONG;
          e.currentTarget.style.boxShadow  = "0 0 18px rgba(255,255,255,0.22)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C_DIM;
        e.currentTarget.style.boxShadow  = "none";
      }}
    >
      {children}
    </button>
  );

  const iconBtnStyle = {
    position: "absolute",
    top: 14,
    zIndex: 20,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 6,
    lineHeight: 0,
    transition: "color 0.2s",
  };

  /* ── hub icon button ─────────────────────────────────── */
  const HubBtn = () => (
    <button
      aria-label="back to hub"
      onClick={() => navigate("/")}
      onMouseEnter={(e) => (e.currentTarget.style.color = C_SOFT)}
      onMouseLeave={(e) => (e.currentTarget.style.color = C_DIM)}
      style={{
        ...iconBtnStyle,
        right:      12,
        color:      C_DIM,
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

  const TapSequenceHint = () => (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           8,
      }}
    >
      <div
        style={{
          color:         C_MAIN,
          fontSize:      8,
          letterSpacing: 2.5,
          opacity:       0.34,
          textTransform: "uppercase",
        }}
      >
        Tap each slot to cycle
      </div>
      <div style={{ display: "flex", gap: 8, opacity: 0.72 }}>
        {Array.from({ length: NUM_SHAPES }, (_, i) => (
          <svg key={i} width={16} height={16} viewBox="0 0 16 16">
            <ShapeElement index={i} cx={8} cy={8} r={6} fill={C_MAIN} />
          </svg>
        ))}
      </div>
    </div>
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
        className="game-area"
        style={{
          position:      "relative",
          width:         560,
          height:        840,
          maxWidth:      "calc(100vw - 24px)",
          maxHeight:     "calc(100dvh - 24px)",
          overflow:      "hidden",
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          justifyContent: "center",
          fontFamily:    mono,
          userSelect:    "none",
          outline:       `1px dashed ${C_FAINT}`,
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
          @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        <button
          aria-label={soundOn ? "mute" : "unmute"}
          onClick={() => setSoundOn(!soundOn)}
          onMouseEnter={(e) => (e.currentTarget.style.color = C_SOFT)}
          onMouseLeave={(e) => (e.currentTarget.style.color = soundOn ? C_DIM : C_FAINT)}
          style={{
            ...iconBtnStyle,
            right: 52,
            color: soundOn ? C_DIM : C_FAINT,
          }}
        >
          <IconSound on={soundOn} />
        </button>
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
              — mastermind —
            </div>

            <div
              style={{
                color:         C_MAIN,
                display:              "grid",
                gridTemplateColumns:  "repeat(2, 1fr)",
                gridTemplateRows:     "repeat(2, 1fr)",
                gap:                  0,
                marginBottom:         20,
              }}
            >
              {[0, 1, 2, 3].map((shape) => (
                <svg key={shape} width={40} height={40} viewBox="0 0 40 40" style={{ opacity: 0.92 }}>
                  <ShapeElement index={shape} cx={20} cy={20} r={19} fill="none" stroke={C_MAIN} strokeWidth={2} />
                </svg>
              ))}
            </div>

            <div
              style={{
                color:         C_MAIN,
                fontSize:      9,
                letterSpacing: 3,
                opacity:       0.28,
                marginBottom:  30,
              }}
            >
              crack the hidden shape code
            </div>

            {/* shape preview */}
            <div style={{ display: "flex", gap: 7, marginBottom: 36 }}>
              {Array.from({ length: NUM_SHAPES }, (_, i) => (
                <svg key={i} width={14} height={14} viewBox="0 0 14 14" style={{ opacity: 0.6 }}>
                  <ShapeElement index={i} cx={7} cy={7} r={5} fill={C_MAIN} />
                </svg>
              ))}
            </div>

            {/* rules */}
            <div style={{ display: "flex", gap: 28, marginBottom: 4 }}>
              {IDLE_RULES.map(([k, v]) => (
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
              {FEEDBACK_LEGEND.map(([sym, label]) => (
                <div key={sym} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width:        8,
                      height:       8,
                      borderRadius: "50%",
                      background:   sym === "●" ? C_MAIN : "transparent",
                      border:       `1px solid ${C_MAIN}`,
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
              animation:     "fadeIn 0.4s ease",
              width:         "100%",
              height:        "100%",
              maxWidth:      500,
              padding:       "0 16px",
              boxSizing:     "border-box",
            }}
          >
            <div
              style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                justifyContent: "center",
                gap:           18,
                width:         "100%",
                flex:          1,
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
            </div>

            <div style={{ paddingBottom: TAP_HINT_BOTTOM_SPACING }}>
              <TapSequenceHint />
            </div>
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
                fontSize:      14,
                letterSpacing: 6,
                textTransform: "uppercase",
                opacity:       0.5,
                marginBottom:  20,
              }}
            >
              {game.won ? "cracked it" : "out of attempts"}
            </div>

            {/* revealed secret */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {game.secret.map((shapeIdx, i) => (
                <svg key={i} width={36} height={36} viewBox="0 0 36 36">
                  <ShapeElement
                    index={shapeIdx}
                    cx={18}
                    cy={18}
                    r={14}
                    fill={C_MAIN}
                  />
                </svg>
              ))}
            </div>

            {game.won ? (
              <div
                style={{
                  color:         C_MAIN,
                  fontSize:      11,
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
                  fontSize:      11,
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
                gap:           8,
                marginBottom:  20,
                maxHeight:     360,
                width:         "100%",
                maxWidth:      420,
                overflowY:     "auto",
              }}
            >
              {game.guesses.map((g, i) => (
                <div
                  key={i}
                  style={{
                    display:    "flex",
                    gap:        10,
                    alignItems: "center",
                    opacity:    game.won && i === game.guesses.length - 1 ? 1 : 0.55,
                  }}
                >
                  <div
                    style={{
                      width:     18,
                      textAlign: "right",
                      color:     C_MAIN,
                      fontSize:  10,
                      opacity:   0.38,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {g.colors.map((c, j) => (
                      <svg key={j} width={20} height={20} viewBox="0 0 20 20">
                        <ShapeElement index={c} cx={10} cy={10} r={8} fill={C_MAIN} />
                      </svg>
                    ))}
                  </div>
                  <FeedbackGrid blacks={g.blacks} whites={g.whites} dotSize={11} gap={5} />
                </div>
              ))}
            </div>

            <Btn onClick={start} style={{ marginTop: 14 }}>again</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
