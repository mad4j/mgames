import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const CELL          = 20;
const MAX_SPEED     = 160;
const MIN_SPEED     = 55;
const GAME_H        = 760;
const SPEED_TICK_MS = 3000;  // interval between time-based speed bumps
const SPEED_TICK_DEC = 4;    // ms removed from interval each bump
const FOOD_MIN_MS   = 1500;  // min food lifetime before reposition
const FOOD_MAX_MS   = 4500;  // max food lifetime before reposition

// ── audio ─────────────────────────────────────────────────────────────────────
function useSound() {
  const ctxRef     = useRef(null);
  const enabledRef = useRef(true);
  const [soundOn, _setSoundOn] = useState(true);

  const setSoundOn = (v) => {
    enabledRef.current = v;
    _setSoundOn(v);
  };

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playTone = useCallback((freq, duration, type = "sine", gainVal = 0.15) => {
    if (!enabledRef.current) return;
    try {
      const ctx  = getCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type            = type;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) { /* ignore AudioContext errors */ }
  }, [getCtx]);

  const playEat = useCallback(() => {
    playTone(880,    0.12, "sine", 0.18);
    setTimeout(() => playTone(1046.5, 0.18, "sine", 0.14), 80);
  }, [playTone]);

  const playDie = useCallback(() => {
    playTone(90, 0.7, "sine",     0.28);
    setTimeout(() => playTone(60, 0.5, "triangle", 0.18), 120);
  }, [playTone]);

  return { soundOn, setSoundOn, playEat, playDie };
}

// ── icon components ───────────────────────────────────────────────────────────
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

function IconHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="2" y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const h = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return size;
}

export const meta = {
  path: "/snake",
  symbol: "◈",
  name: "snake",
  description: "eat the diamond, don't hit the walls",
  status: "final",
};

const MAX_WIDTH = 430;

export default function SnakeGame() {
  const { w, h } = useWindowSize();
  const navigate = useNavigate();
  const containerW = Math.min(w - 32, MAX_WIDTH);
  const containerH = Math.min(h - 32, GAME_H);
  const cols = Math.floor(containerW / CELL);
  const rows = Math.floor(containerH / CELL);

  const [phase,       setPhase]       = useState("idle");
  const [score,       setScore]       = useState(0);
  const [streak,      setStreak]      = useState(1);
  const [best,        setBest]        = useState(0);
  const [flash,       setFlash]       = useState(false);
  const [renderSnake, setRenderSnake] = useState([]);
  const [renderFood,  setRenderFood]  = useState(null);
  const [foodKey,     setFoodKey]     = useState(0);

  // All mutable game state lives in refs so the loop closure stays stable
  const snakeRef       = useRef([]);
  const foodRef        = useRef(null);
  const dirRef         = useRef({ x: 1, y: 0 });
  const nextDirRef     = useRef({ x: 1, y: 0 });
  const phaseRef       = useRef("idle");
  const speedRef       = useRef(MAX_SPEED);
  const scoreRef       = useRef(0);
  const streakRef      = useRef(1);
  const bestRef        = useRef(0);
  const loopId         = useRef(null);
  const touchStart     = useRef(null);
  const colsRef        = useRef(cols);
  const rowsRef        = useRef(rows);
  const foodExpiresAt  = useRef(0);

  useEffect(() => { colsRef.current = cols; }, [cols]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // ── sound ────────────────────────────────────────────────────────────────
  const { soundOn, setSoundOn, playEat, playDie } = useSound();
  // Keep latest sound fns in a ref so tick closure doesn't need them as deps
  const soundRef = useRef({ playEat, playDie });
  useEffect(() => { soundRef.current = { playEat, playDie }; }, [playEat, playDie]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const randFood = useCallback((sn) => {
    const occupied = new Set(sn.map(s => `${s.x},${s.y}`));
    let f;
    do {
      f = {
        x: Math.floor(Math.random() * colsRef.current),
        y: Math.floor(Math.random() * rowsRef.current),
      };
    } while (occupied.has(`${f.x},${f.y}`));
    return f;
  }, []);

  // Place food and set a random expiry time
  const placeFood = useCallback((sn) => {
    const f = randFood(sn);
    foodExpiresAt.current = Date.now() + FOOD_MIN_MS + Math.random() * (FOOD_MAX_MS - FOOD_MIN_MS);
    return f;
  }, [randFood]);

  // ── game loop ─────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (phaseRef.current !== "playing") return;

    dirRef.current = { ...nextDirRef.current };
    const head = {
      x: snakeRef.current[0].x + dirRef.current.x,
      y: snakeRef.current[0].y + dirRef.current.y,
    };

    // Collision: wall or self
    if (
      head.x < 0 || head.x >= colsRef.current ||
      head.y < 0 || head.y >= rowsRef.current ||
      snakeRef.current.some(s => s.x === head.x && s.y === head.y)
    ) {
      soundRef.current.playDie();
      phaseRef.current = "dying";
      setFlash(true);
      setTimeout(() => {
        setFlash(false);
        if (scoreRef.current > bestRef.current) {
          bestRef.current = scoreRef.current;
          setBest(scoreRef.current);
        }
        phaseRef.current = "done";
        setPhase("done");
      }, 400);
      return;
    }

    const newSnake = [head, ...snakeRef.current];

    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
      // Ate the food — score increases by current streak, then streak grows
      scoreRef.current += streakRef.current;
      streakRef.current++;
      setScore(scoreRef.current);
      setStreak(streakRef.current);
      soundRef.current.playEat();
      const newFood = placeFood(newSnake);
      foodRef.current = newFood;
      setRenderFood(newFood);
      setFoodKey(k => k + 1);
      speedRef.current = Math.max(MIN_SPEED, speedRef.current - 5);
    } else {
      // Check if food lifetime expired → reposition without scoring, reset streak
      if (Date.now() >= foodExpiresAt.current) {
        streakRef.current = 1;
        setStreak(1);
        const newFood = placeFood(newSnake);
        foodRef.current = newFood;
        setRenderFood(newFood);
        setFoodKey(k => k + 1);
      }
      newSnake.pop();
    }

    snakeRef.current = newSnake;
    setRenderSnake([...newSnake]);

    loopId.current = setTimeout(tick, speedRef.current);
  }, [placeFood]);

  // ── time-based speed increase ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      speedRef.current = Math.max(MIN_SPEED, speedRef.current - SPEED_TICK_DEC);
    }, SPEED_TICK_MS);
    return () => clearInterval(iv);
  }, [phase]);

  // ── start ─────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    if (loopId.current) clearTimeout(loopId.current);

    const mx = Math.floor(colsRef.current / 2);
    const my = Math.floor(rowsRef.current / 2);
    const initSnake = [{ x: mx, y: my }, { x: mx - 1, y: my }, { x: mx - 2, y: my }];
    const initFood  = placeFood(initSnake);
    const initDir   = { x: 1, y: 0 };

    snakeRef.current   = initSnake;
    foodRef.current    = initFood;
    dirRef.current     = initDir;
    nextDirRef.current = initDir;
    scoreRef.current   = 0;
    streakRef.current  = 1;
    speedRef.current   = MAX_SPEED;
    phaseRef.current   = "playing";

    setRenderSnake([...initSnake]);
    setRenderFood(initFood);
    setFoodKey(k => k + 1);
    setScore(0);
    setStreak(1);
    setFlash(false);
    setPhase("playing");

    loopId.current = setTimeout(tick, MAX_SPEED);
  }, [placeFood, tick]);

  useEffect(() => () => { if (loopId.current) clearTimeout(loopId.current); }, []);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const KEY_DIR = {
      ArrowUp:    { x: 0, y:-1 }, ArrowDown:  { x: 0, y: 1 },
      ArrowLeft:  { x:-1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y:-1 }, s: { x: 0, y: 1 },
      a: { x:-1, y: 0 }, d: { x: 1, y: 0 },
    };
    const handle = (e) => {
      if (phaseRef.current !== "playing") return;
      const d = KEY_DIR[e.key] || KEY_DIR[e.key.toLowerCase()];
      if (!d || (d.x === -dirRef.current.x && d.y === -dirRef.current.y)) return;
      nextDirRef.current = d;
      e.preventDefault();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if ((e.code !== "Space" && e.key !== " ") || (phase !== "idle" && phase !== "done")) return;
      e.preventDefault();
      startGame();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame]);

  // ── touch ─────────────────────────────────────────────────────────────────
  const handleTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    if (!touchStart.current || phaseRef.current !== "playing") return;
    const startX = touchStart.current.x;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      // Tap: turn left or right relative to current direction
      const cur = dirRef.current;
      const d = startX < window.innerWidth / 2
        ? { x:  cur.y, y: -cur.x }   // turn left (counter-clockwise)
        : { x: -cur.y, y:  cur.x };  // turn right (clockwise)
      nextDirRef.current = d;
      return;
    }
    let d;
    if (Math.abs(dx) > Math.abs(dy)) {
      d = dx > 0 ? { x: 1, y: 0 } : { x:-1, y: 0 };
    } else {
      d = dy > 0 ? { x: 0, y: 1 } : { x: 0, y:-1 };
    }
    if (d.x === -dirRef.current.x && d.y === -dirRef.current.y) return;
    nextDirRef.current = d;
  };

  // ── derived visual values ──────────────────────────────────────────────────
  const BtnStyle = {
    background:    "transparent",
    border:        "1px solid rgba(255,255,255,0.22)",
    color:         "#fff",
    fontFamily:    "'DM Mono', monospace",
    fontSize:      11,
    letterSpacing: 5,
    padding:       "14px 36px",
    cursor:        "pointer",
    textTransform: "uppercase",
  };

  const iconBtnStyle = {
    position: "absolute", top: 14, zIndex: 20,
    background: "transparent", border: "none",
    color: "rgba(255,255,255,0.38)",
    cursor: "pointer", padding: 6,
    lineHeight: 0,
    transition: "color 0.2s",
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width:           "100vw",
      height:          "100dvh",
      background:      "#0a0a0a",
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
    }}>
    <div
      className="game-area"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position:   "relative",
        width:      cols * CELL,
        height:     rows * CELL,
        overflow:   "hidden",
        userSelect: "none",
        fontFamily: "'DM Mono', 'Courier New', monospace",
        touchAction:"none",
        outline:    "1px dashed rgba(255,255,255,0.12)",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes flashAnim {
          0%   { opacity: 0.55; }
          40%  { opacity: 0.1;  }
          100% { opacity: 0;    }
        }
        @keyframes foodAppear {
          from { opacity: 0; transform: translate(-50%,-50%) rotate(45deg) scale(0.2); }
          to   { opacity: 1; transform: translate(-50%,-50%) rotate(45deg) scale(1);   }
        }
      `}</style>

      {/* ── SOUND TOGGLE + HUB (always visible) ── */}
      <button
        aria-label={soundOn ? "mute" : "unmute"}
        onClick={() => setSoundOn(!soundOn)}
        onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
        onMouseLeave={e => e.currentTarget.style.color = soundOn ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.18)"}
        style={{
          ...iconBtnStyle,
          right: 52,
          color: `rgba(255,255,255,${soundOn ? 0.38 : 0.18})`,
        }}
      >
        <IconSound on={soundOn} />
      </button>
      <button
        aria-label="back to hub"
        onClick={() => navigate("/")}
        onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
        onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.38)"}
        style={{ ...iconBtnStyle, right: 12 }}
      >
        <IconHub />
      </button>

      {/* Death flash */}
      {flash && (
        <div style={{
          position:   "absolute",
          inset:      0,
          background: "#fff",
          animation:  "flashAnim 0.4s ease forwards",
          pointerEvents: "none",
          zIndex:     30,
        }} />
      )}

      {/* ── IDLE ── */}
      {phase === "idle" && (
        <div style={{
          position:       "absolute", inset: 0,
          display:        "flex",     flexDirection: "column",
          alignItems:     "center",   justifyContent: "center",
          animation:      "fadeIn 0.6s ease",
        }}>
          <div style={{ color:"#fff", fontSize:11, letterSpacing:6, opacity:0.28, textTransform:"uppercase" }}>snake</div>

          {/* Diamond icon */}
          <div style={{
            width:      26, height: 26,
            border:     "1.5px solid rgba(255,255,255,0.55)",
            background: "rgba(255,255,255,0.04)",
            transform:  "rotate(45deg)",
            margin:     "36px 0",
          }} />

          {best > 0 && (
            <div style={{ color:"#fff", fontSize:11, letterSpacing:3, opacity:0.18, marginBottom: 8 }}>
              best {best}
            </div>
          )}

          <button
            style={{ ...BtnStyle, marginTop: 48 }}
            onMouseEnter={e => e.target.style.borderColor = "rgba(255,255,255,0.6)"}
            onMouseLeave={e => e.target.style.borderColor = "rgba(255,255,255,0.22)"}
            onClick={startGame}
          >start</button>

          <div style={{ color:"#fff", fontSize:10, letterSpacing:3, opacity:0.14, textTransform:"uppercase", marginTop:48 }}>
            tap · swipe · arrows
          </div>
        </div>
      )}

      {/* ── PLAYING ── */}
      {(phase === "playing" || phase === "dying") && (
        <>
          {/* Score HUD */}
          <div style={{
            position:      "absolute",
            top:           18, left: 24,
            color:         "rgba(255,255,255,0.88)",
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      16,
            zIndex:        10,
            pointerEvents: "none",
            textShadow:    "0 0 6px rgba(255,255,255,0.55)",
            display:       "flex",
            alignItems:    "baseline",
            gap:           6,
          }}>
            <span>{score}</span>
            {streak > 1 && (
              <span style={{ fontSize: 11, opacity: 0.55, letterSpacing: 1 }}>×{streak}</span>
            )}
          </div>

          {/* Food — diamond */}
          {renderFood && (
            <div
              key={foodKey}
              style={{
                position:   "absolute",
                left:       renderFood.x * CELL + CELL / 2,
                top:        renderFood.y * CELL + CELL / 2,
                width:      CELL * 0.6,
                height:     CELL * 0.6,
                border:     "1.5px solid rgba(255,255,255,0.88)",
                background: "rgba(255,255,255,0.05)",
                transform:  "translate(-50%,-50%) rotate(45deg)",
                animation:  "foodAppear 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Snake — squares */}
          {renderSnake.map((seg, i) => {
            const t     = 1 - i / renderSnake.length;
            const alpha = i === 0 ? 0.92 : Math.pow(t, 0.55) * 0.68;
            const size  = i === 0 ? CELL - 3 : CELL - 5;
            const off   = (CELL - size) / 2;
            return (
              <div
                key={i}
                style={{
                  position:   "absolute",
                  left:       seg.x * CELL + off,
                  top:        seg.y * CELL + off,
                  width:      size,
                  height:     size,
                  background: i === 0
                    ? `rgba(255,255,255,${alpha})`
                    : `rgba(255,255,255,${alpha * 0.05})`,
                  border: i === 0
                    ? "none"
                    : `1.5px solid rgba(255,255,255,${alpha})`,
                  pointerEvents: "none",
                }}
              />
            );
          })}
        </>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div style={{
          position:       "absolute", inset: 0,
          display:        "flex",     flexDirection: "column",
          alignItems:     "center",   justifyContent: "center",
          animation:      "fadeIn 0.5s ease",
        }}>
          <div style={{ color:"#fff", fontSize:11, letterSpacing:6, opacity:0.28, textTransform:"uppercase", marginBottom:16 }}>score</div>
          <div style={{ color:"#fff", fontSize:88, fontWeight:300, letterSpacing:-4, lineHeight:1 }}>{score}</div>
          {score > 0 && score >= best
            ? <div style={{ color:"#fff", fontSize:10, letterSpacing:5, opacity:0.32, marginTop:12, textTransform:"uppercase" }}>new best</div>
            : <div style={{ color:"#fff", fontSize:10, letterSpacing:4, opacity:0.20, marginTop:12 }}>best {best}</div>
          }
          <button
            style={{ ...BtnStyle, marginTop: 56 }}
            onMouseEnter={e => e.target.style.borderColor = "rgba(255,255,255,0.6)"}
            onMouseLeave={e => e.target.style.borderColor = "rgba(255,255,255,0.22)"}
            onClick={startGame}
          >again</button>
        </div>
      )}
    </div>
    </div>
  );
}
