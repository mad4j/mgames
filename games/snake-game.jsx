import { useState, useEffect, useRef, useCallback } from "react";

const CELL      = 20;
const MAX_SPEED = 160;
const MIN_SPEED = 55;

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
};

export default function SnakeGame() {
  const { w, h } = useWindowSize();
  const cols = Math.floor(w / CELL);
  const rows = Math.floor(h / CELL);

  const [phase,       setPhase]       = useState("idle");
  const [score,       setScore]       = useState(0);
  const [best,        setBest]        = useState(0);
  const [speed,       setSpeed]       = useState(MAX_SPEED);
  const [flash,       setFlash]       = useState(false);
  const [renderSnake, setRenderSnake] = useState([]);
  const [renderFood,  setRenderFood]  = useState(null);
  const [foodKey,     setFoodKey]     = useState(0);

  // All mutable game state lives in refs so the loop closure stays stable
  const snakeRef   = useRef([]);
  const foodRef    = useRef(null);
  const dirRef     = useRef({ x: 1, y: 0 });
  const nextDirRef = useRef({ x: 1, y: 0 });
  const phaseRef   = useRef("idle");
  const speedRef   = useRef(MAX_SPEED);
  const scoreRef   = useRef(0);
  const bestRef    = useRef(0);
  const loopId     = useRef(null);
  const touchStart = useRef(null);
  const colsRef    = useRef(cols);
  const rowsRef    = useRef(rows);

  useEffect(() => { colsRef.current = cols; }, [cols]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

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
      scoreRef.current++;
      setScore(scoreRef.current);
      const newFood = randFood(newSnake);
      foodRef.current = newFood;
      setRenderFood(newFood);
      setFoodKey(k => k + 1);
      speedRef.current = Math.max(MIN_SPEED, speedRef.current - 5);
      setSpeed(speedRef.current);
    } else {
      newSnake.pop();
    }

    snakeRef.current = newSnake;
    setRenderSnake([...newSnake]);

    loopId.current = setTimeout(tick, speedRef.current);
  }, [randFood]);

  // ── start ─────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    if (loopId.current) clearTimeout(loopId.current);

    const mx = Math.floor(colsRef.current / 2);
    const my = Math.floor(rowsRef.current / 2);
    const initSnake = [{ x: mx, y: my }, { x: mx - 1, y: my }, { x: mx - 2, y: my }];
    const initFood  = randFood(initSnake);
    const initDir   = { x: 1, y: 0 };

    snakeRef.current   = initSnake;
    foodRef.current    = initFood;
    dirRef.current     = initDir;
    nextDirRef.current = initDir;
    scoreRef.current   = 0;
    speedRef.current   = MAX_SPEED;
    phaseRef.current   = "playing";

    setRenderSnake([...initSnake]);
    setRenderFood(initFood);
    setFoodKey(k => k + 1);
    setScore(0);
    setSpeed(MAX_SPEED);
    setFlash(false);
    setPhase("playing");

    loopId.current = setTimeout(tick, MAX_SPEED);
  }, [randFood, tick]);

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

  // ── touch ─────────────────────────────────────────────────────────────────
  const handleTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    if (!touchStart.current || phaseRef.current !== "playing") return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
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
  const speedFrac = (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED); // 1=slow 0=fast
  const barColor  = speedFrac < 0.25
    ? "rgba(255,65,65,0.65)"
    : "rgba(255,255,255,0.45)";

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

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        width:      "100vw",
        height:     "100dvh",
        background: "#0a0a0a",
        overflow:   "hidden",
        position:   "relative",
        userSelect: "none",
        fontFamily: "'DM Mono', 'Courier New', monospace",
        touchAction:"none",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');

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
            swipe · arrows
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
            color:         "#fff",
            fontSize:      32,
            fontWeight:    300,
            letterSpacing: -1,
            zIndex:        10,
            pointerEvents: "none",
          }}>{score}</div>

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

          {/* Speed bar (mirrors timer bar in tap game) */}
          <div style={{
            position:      "absolute",
            bottom:        0, left: 0, right: 0,
            height:        5,
            background:    "rgba(255,255,255,0.06)",
            zIndex:        10,
            pointerEvents: "none",
          }}>
            <div style={{
              height:     "100%",
              width:      `${(1 - speedFrac) * 100}%`,
              background: barColor,
              transition: "width 0.28s ease, background 0.4s",
              boxShadow:  speedFrac < 0.25 ? "0 0 10px rgba(255,65,65,0.4)" : "none",
            }} />
          </div>
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
  );
}
