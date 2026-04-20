import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const COLS              = 20;
const ROWS              = 32;
const CELL_W            = 430 / COLS;   // 21.5 px
const CELL_H            = 20;           // px
const GRID_H            = ROWS * CELL_H; // 640 px

const PLANE_SPEED_START = 210;  // ms / column at pass 0
const PLANE_SPEED_MIN   = 70;   // ms / column floor
const PLANE_ACCEL       = 5;    // ms shaved off per completed pass
const BOMB_SPEED        = 40;   // ms / row
const MAX_BUILD_HEIGHT  = 14;   // floors
const SCORE_PER_FLOOR   = 10;
const SCORE_PER_PASS    = 5;

// Leave a small gap so the CSS transition always completes before the next step
const TRANSITION_OFFSET_MS = 12;

function generateBuildings() {
  return Array.from({ length: COLS }, () =>
    1 + Math.floor(Math.random() * MAX_BUILD_HEIGHT)
  );
}

// ── audio ────────────────────────────────────────────────────────────────────
function useSound() {
  const ctxRef     = useRef(null);
  const enabledRef = useRef(true);
  const [soundOn, _setSoundOn] = useState(true);

  const setSoundOn = (v) => { enabledRef.current = v; _setSoundOn(v); };

  const getCtx = useCallback(() => {
    if (!ctxRef.current)
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playTone = useCallback((freq, dur, type = "square", vol = 0.15) => {
    if (!enabledRef.current) return;
    try {
      const ctx  = getCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type            = type;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (_) { /* ignore AudioContext errors */ }
  }, [getCtx]);

  // Short blip when bomb is dropped
  const playDrop = useCallback(() => {
    playTone(660, 0.05, "square", 0.09);
  }, [playTone]);

  // Explosion when bomb hits building
  const playBlast = useCallback(() => {
    playTone(180, 0.12, "sawtooth", 0.22);
    setTimeout(() => playTone(110, 0.18, "sawtooth", 0.14), 70);
  }, [playTone]);

  // Crash when plane hits building
  const playCrash = useCallback(() => {
    playTone(220, 0.08, "sawtooth", 0.32);
    setTimeout(() => playTone(150, 0.14, "sawtooth", 0.26), 80);
    setTimeout(() => playTone(80,  0.38, "sawtooth", 0.18), 170);
  }, [playTone]);

  return { soundOn, setSoundOn, playDrop, playBlast, playCrash };
}

// ── game sprites ─────────────────────────────────────────────────────────────
function Biplane() {
  const c = "var(--mg-color-text-strong)";
  return (
    <svg width="32" height="16" viewBox="0 0 32 16" fill="none" role="img" aria-label="Player aircraft">
      {/* Upper wing – flat rectangle, no rounding */}
      <rect x="7" y="0" width="14" height="3" fill={c} />
      {/* Fuselage – boxy rectangular body */}
      <rect x="3" y="5" width="23" height="6" fill={c} />
      {/* Nose step */}
      <rect x="26" y="6" width="4" height="4" fill={c} />
      {/* Vertical tail fin */}
      <polygon points="3,5 3,1 7,5" fill={c} />
      {/* Horizontal stabilizer */}
      <rect x="0" y="11" width="7" height="2" fill={c} />
      {/* Lower wing – flat rectangle, no rounding */}
      <rect x="7" y="13" width="14" height="3" fill={c} />
      {/* Wing struts – thin vertical bars */}
      <rect x="10" y="3" width="1" height="10" fill={c} opacity="0.55" />
      <rect x="18" y="3" width="1" height="10" fill={c} opacity="0.55" />
      {/* Cockpit – dark square window */}
      <rect x="14" y="6" width="5" height="4" fill="rgba(10,10,10,0.90)" />
      {/* Propeller disc */}
      <rect x="29" y="2" width="2" height="12" rx="1" fill={c} opacity="0.80" />
      {/* Propeller hub */}
      <circle cx="30" cy="8" r="1.4" fill="rgba(10,10,10,0.85)" stroke={c} strokeWidth="0.7" />
    </svg>
  );
}

// Shared bomb drawing – used as the in-game projectile (small) and as the hub
// card symbol (large). The viewBox is "0 0 18 22" – shorter and squatter than
// the classic design. Two small tail fins, a compact body, rounded nose.
function BombSVG({ width = 12, height = 15 }) {
  const c = "var(--mg-color-surface-strong)";
  return (
    <svg width={width} height={height} viewBox="0 0 18 22" fill="none" role="img" aria-label="bomb">
      {/* Single path: small tail fins (with V-notch) → short body → rounded nose */}
      <path
        fill={c}
        d="M0,6 L0,0 L7,0 L9,3 L11,0 L18,0 L18,6 L14,7 L14,17 Q14,22 9,22 Q4,22 4,17 L4,7 Z"
      />
    </svg>
  );
}

function Bomb() {
  return <BombSVG width={11} height={14} />;
}

// Scalloped cap drawn as an SVG positioned above each building div.
// Two upward-arching semicircles give the classic Blitz battlement silhouette.
function BuildingCap({ width }) {
  const w = width;
  const sw = w / 2;          // two scallops
  const r  = sw / 2;         // radius of each arc
  const h  = r;              // SVG height equals radius → arcs reach y = 0
  // sweep-flag=1 (CW in SVG) traces the upper arc from left to right
  const d = `M 0 ${h} A ${r} ${r} 0 0 1 ${sw} ${h} A ${r} ${r} 0 0 1 ${w} ${h} Z`;
  return (
    <svg
      width={w} height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ position: "absolute", top: -h, left: 0, display: "block" }}
    >
      <path d={d} fill="rgba(255,255,255,0.70)" />
    </svg>
  );
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
      <rect x="2"  y="2"  width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="2"  width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="2"  y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

// ── meta ──────────────────────────────────────────────────────────────────────
export const meta = {
  path: "/blitz",
  // JSX element – Hub renders {g.symbol} directly so React elements are valid
  symbol: <BombSVG width={18} height={22} />,
  name: "blitz",
  description: "drop bombs, clear the runway",
  status: "draft",
};

// ── component ─────────────────────────────────────────────────────────────────
export default function BlitzGame() {
  const [phase,     setPhase]     = useState("idle");
  const navigate = useNavigate();
  const [planeCol,  setPlaneCol]  = useState(0);
  const [planeRow,  setPlaneRow]  = useState(0);
  const [bomb,      setBomb]      = useState(null);   // { col, row } | null
  const [buildings, setBuildings] = useState(() => generateBuildings());
  const [score,     setScore]     = useState(0);
  const [best,      setBest]      = useState(0);
  const [explosions, setExplosions] = useState([]);   // [{ id, x, y }]

  // Mutable refs – read/written inside setTimeout / setInterval callbacks
  const phaseRef    = useRef("idle");
  const planeColRef = useRef(0);
  const planeRowRef = useRef(0);
  const passRef     = useRef(0);
  const bombRef     = useRef(null);
  const buildRef    = useRef(null);
  const planeTimer  = useRef(null);
  const explosionId = useRef(0);

  const { soundOn, setSoundOn, playDrop, playBlast, playCrash } = useSound();

  // ── game start ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const b = generateBuildings();
    buildRef.current    = b;
    planeColRef.current = 0;
    planeRowRef.current = 0;
    passRef.current     = 0;
    bombRef.current     = null;
    phaseRef.current    = "playing";

    setBuildings([...b]);
    setPlaneCol(0);
    setPlaneRow(0);
    setBomb(null);
    setScore(0);
    setExplosions([]);
    setPhase("playing");
  }, []);

  // ── plane movement (recursive setTimeout so speed can change each pass) ───
  useEffect(() => {
    if (phase !== "playing") return;

    const scheduleNext = () => {
      const speed = Math.max(
        PLANE_SPEED_MIN,
        PLANE_SPEED_START - passRef.current * PLANE_ACCEL,
      );
      planeTimer.current = setTimeout(movePlane, speed);
    };

    const movePlane = () => {
      if (phaseRef.current !== "playing") return;

      let col = planeColRef.current + 1;
      let row = planeRowRef.current;

      if (col >= COLS) {
        // End of pass – descend one row
        col = 0;
        row += 1;
        passRef.current += 1;
        planeRowRef.current = row;
        setPlaneRow(row);
        setScore(s => s + SCORE_PER_PASS);

        // Fell off the bottom → game over
        if (row >= ROWS) {
          playCrash();
          phaseRef.current = "done";
          setPhase("done");
          return;
        }
      }

      planeColRef.current = col;
      setPlaneCol(col);

      // Collision: plane enters a building cell
      const bh = buildRef.current[col];
      if (bh > 0 && row >= ROWS - bh) {
        playCrash();
        phaseRef.current = "done";
        setPhase("done");
        return;
      }

      scheduleNext();
    };

    scheduleNext();
    return () => {
      if (planeTimer.current) clearTimeout(planeTimer.current);
    };
  }, [phase, playCrash]);

  // ── bomb fall loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      if (!bombRef.current) return;

      const { col, row } = bombRef.current;
      const nextRow      = row + 1;
      const bh           = buildRef.current[col];
      const buildTop     = ROWS - bh;

      if (bh > 0 && nextRow >= buildTop) {
        // Hit building – remove 1–3 top floors
        const floorsDestroyed = 1 + Math.floor(Math.random() * 3);
        const nb = [...buildRef.current];
        nb[col]  = Math.max(0, nb[col] - floorsDestroyed);
        buildRef.current = nb;
        setBuildings([...nb]);
        setScore(s => s + SCORE_PER_FLOOR * floorsDestroyed);
        playBlast();
        bombRef.current = null;
        setBomb(null);
        // Spawn explosion at the top of the hit building
        const expX = col * CELL_W + CELL_W / 2;
        const expY = buildTop * CELL_H + CELL_H / 2;
        const eid  = ++explosionId.current;
        setExplosions(prev => [...prev, { id: eid, x: expX, y: expY }]);
        setTimeout(() => setExplosions(prev => prev.filter(e => e.id !== eid)), 500);
      } else if (nextRow >= ROWS) {
        // Hit ground
        bombRef.current = null;
        setBomb(null);
      } else {
        const next = { col, row: nextRow };
        bombRef.current = next;
        setBomb(next);
      }
    }, BOMB_SPEED);
    return () => clearInterval(iv);
  }, [phase, playBlast]);

  // ── drop bomb ────────────────────────────────────────────────────────────
  const dropBomb = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (bombRef.current) return;                  // only one bomb at a time
    const startRow = planeRowRef.current + 1;
    if (startRow >= ROWS) return;
    const b = { col: planeColRef.current, row: startRow };
    bombRef.current = b;
    setBomb(b);
    playDrop();
  }, [playDrop]);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e) => {
      if (e.code === "Space" || e.key === " " || e.code === "ArrowDown") {
        e.preventDefault();
        dropBomb();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, dropBomb]);

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

  // ── best score ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "done") setBest(b => Math.max(b, score));
  }, [phase, score]);

  // ── shared styles ─────────────────────────────────────────────────────────
  const BtnStyle = {
    background: "transparent",
    border: "1px solid var(--mg-color-text-subtle)",
    color: "var(--mg-color-text-primary)",
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: 5,
    padding: "14px 36px",
    cursor: "pointer",
    textTransform: "uppercase",
  };

  const iconBtnStyle = {
    position: "absolute", top: 14, zIndex: 20,
    background: "transparent", border: "none",
    color: "var(--mg-color-text-dim)",
    cursor: "pointer", padding: 6,
    lineHeight: 0,
    transition: "color 0.2s",
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: "100vw", height: "100dvh",
      background: "var(--mg-color-background)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
    <div className="game-area" style={{
      position: "relative",
      width: 430,
      height: GRID_H,
      maxWidth: "calc(100vw - 32px)",
      maxHeight: "calc(100dvh - 32px)",
      overflow: "hidden",
      userSelect: "none",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      touchAction: "none",
      outline: "1px dashed var(--mg-color-text-subtle)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bombDrop {
          from { transform: translate(-50%,-50%) scale(0.4) rotate(-20deg); opacity: 0.4; }
          to   { transform: translate(-50%,-50%) scale(1)   rotate(0deg);   opacity: 1; }
        }
        @keyframes planeSlide {
          from { opacity: 0.5; }
          to   { opacity: 1; }
        }
        @keyframes expPart0 { from{opacity:1} to{transform:translate(0,-22px) scale(0); opacity:0} }
        @keyframes expPart1 { from{opacity:1} to{transform:translate(16px,-16px) scale(0); opacity:0} }
        @keyframes expPart2 { from{opacity:1} to{transform:translate(22px,0) scale(0); opacity:0} }
        @keyframes expPart3 { from{opacity:1} to{transform:translate(16px,16px) scale(0); opacity:0} }
        @keyframes expPart4 { from{opacity:1} to{transform:translate(0,22px) scale(0); opacity:0} }
        @keyframes expPart5 { from{opacity:1} to{transform:translate(-16px,16px) scale(0); opacity:0} }
        @keyframes expPart6 { from{opacity:1} to{transform:translate(-22px,0) scale(0); opacity:0} }
        @keyframes expPart7 { from{opacity:1} to{transform:translate(-16px,-16px) scale(0); opacity:0} }
      `}</style>

      {/* ── SOUND TOGGLE ── */}
      <button
        aria-label={soundOn ? "mute" : "unmute"}
        onClick={() => setSoundOn(!soundOn)}
        onMouseEnter={e => e.currentTarget.style.color = "var(--mg-color-text-hover)"}
        onMouseLeave={e => e.currentTarget.style.color = soundOn ? "var(--mg-color-text-dim)" : "var(--mg-color-text-weak)"}
        style={{
          ...iconBtnStyle,
          right: 52,
          color: soundOn ? "var(--mg-color-text-dim)" : "var(--mg-color-text-weak)",
        }}
      >
        <IconSound on={soundOn} />
      </button>

      {/* ── HUB ── */}
      <button
        aria-label="back to hub"
        onClick={() => navigate("/")}
        onMouseEnter={e => e.currentTarget.style.color = "var(--mg-color-text-hover)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--mg-color-text-dim)"}
        style={{ ...iconBtnStyle, right: 12 }}
      >
        <IconHub />
      </button>

      {/* ── IDLE ── */}
      {phase === "idle" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.6s ease",
        }}>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:11, letterSpacing:6, marginBottom:32, opacity:0.28, textTransform:"uppercase" }}>blitz</div>
          <div style={{ lineHeight:0, marginBottom:8, opacity:0.85 }}>
            <BombSVG width={50} height={61} />
          </div>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:9, letterSpacing:3, marginTop:32, opacity:0.28, textAlign:"center", lineHeight:2.2, textTransform:"uppercase" }}>
            drop bombs<br/>clear the runway
          </div>
          {best > 0 && (
            <div style={{ color:"var(--mg-color-text-primary)", fontSize:11, letterSpacing:3, marginTop:48, opacity:0.18 }}>best {best}</div>
          )}
          <button
            style={{ ...BtnStyle, marginTop: best > 0 ? 32 : 56 }}
            onMouseEnter={e => e.target.style.borderColor = "rgba(255,255,255,0.6)"}
            onMouseLeave={e => e.target.style.borderColor = "var(--mg-color-text-subtle)"}
            onClick={startGame}
          >start</button>
        </div>
      )}

      {/* ── PLAYING ── */}
      {phase === "playing" && (
        <>
          {/* Score */}
          <div style={{
            position: "absolute", top: 18, left: 24, zIndex: 10,
            color: "var(--mg-color-text-primary)", fontSize: 32, fontWeight: 300, letterSpacing: -1,
          }}>{score}</div>

          {/* Game grid */}
          <div
            onPointerDown={dropBomb}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 430,
              height: GRID_H,
              cursor: "pointer",
            }}
          >
            {/* Ground line */}
            <div style={{
              position: "absolute",
              bottom: 0, left: 0, right: 0,
              height: 1,
              background: "var(--mg-color-surface-medium)",
            }} />

            {/* Buildings – each floor drawn as an individual square (Snake body-style) */}
            {buildings.map((height, col) =>
              height > 0 && (
                <div
                  key={col}
                  style={{
                    position: "absolute",
                    left: col * CELL_W,
                    bottom: 0,
                    width: CELL_W - 1,
                    height: height * CELL_H,
                    overflow: "visible",
                  }}
                >
                  {Array.from({ length: height }, (_, i) => {
                    const isTop = i === height - 1;
                    const alpha = isTop ? 0.80 : 0.35 + 0.25 * (i / height);
                    return (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          bottom: i * CELL_H + 1,
                          left: 1,
                          width: CELL_W - 3,
                          height: CELL_H - 3,
                          background: isTop
                            ? `rgba(255,255,255,${alpha})`
                            : `rgba(255,255,255,0.04)`,
                          border: isTop
                            ? "none"
                            : `1.5px solid rgba(255,255,255,${alpha})`,
                          boxSizing: "border-box",
                        }}
                      />
                    );
                  })}
                </div>
              )
            )}

            {/* Plane */}
            <div
              key={planeRow}
              style={{
                position: "absolute",
                left: planeCol * CELL_W,
                top: planeRow * CELL_H,
                width: CELL_W,
                height: CELL_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5,
                transition: `left ${Math.max(PLANE_SPEED_MIN, PLANE_SPEED_START - passRef.current * PLANE_ACCEL) - TRANSITION_OFFSET_MS}ms linear`,
                animation: "planeSlide 0.12s ease",
              }}
            ><Biplane /></div>

            {/* Bomb */}
            {bomb && (
              <div style={{
                position: "absolute",
                left: bomb.col * CELL_W + CELL_W / 2,
                top: bomb.row * CELL_H + CELL_H / 2,
                transform: "translate(-50%,-50%)",
                zIndex: 6,
                animation: "bombDrop 0.08s ease",
                lineHeight: 0,
              }}>
                <Bomb />
              </div>
            )}

            {/* Explosions – 8 particle squares flying outward */}
            {explosions.map(({ id, x, y }) => (
              <div key={id} style={{
                position: "absolute",
                left: x, top: y,
                zIndex: 8,
                pointerEvents: "none",
              }}>
                {[0,1,2,3,4,5,6,7].map(i => (
                  <div key={i} style={{
                    position: "absolute",
                    left: -2.5, top: -2.5,
                    width: 5, height: 5,
                    background: "var(--mg-color-surface-strong)",
                    animation: `expPart${i} 0.45s ease-out forwards`,
                    animationDelay: `${i * 12}ms`,
                  }} />
                ))}
              </div>
            ))}
          </div>

          {/* Hint */}
          <div style={{
            position: "absolute",
            bottom: 14,
            width: "100%",
            textAlign: "center",
            color: "var(--mg-color-text-primary)",
            fontSize: 9,
            letterSpacing: 3,
            opacity: 0.18,
            textTransform: "uppercase",
          }}>tap · space to drop</div>
        </>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.5s ease",
        }}>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:11, letterSpacing:6, opacity:0.28, textTransform:"uppercase", marginBottom:16 }}>score</div>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:88, fontWeight:300, letterSpacing:-4, lineHeight:1 }}>{score}</div>
          {score > 0 && score >= best
            ? <div style={{ color:"var(--mg-color-text-primary)", fontSize:10, letterSpacing:5, opacity:0.32, marginTop:12, textTransform:"uppercase" }}>new best</div>
            : <div style={{ color:"var(--mg-color-text-primary)", fontSize:10, letterSpacing:4, opacity:0.2,  marginTop:12 }}>best {best}</div>
          }
          <button
            style={{ ...BtnStyle, marginTop: 56 }}
            onMouseEnter={e => e.target.style.borderColor = "rgba(255,255,255,0.6)"}
            onMouseLeave={e => e.target.style.borderColor = "var(--mg-color-text-subtle)"}
            onClick={startGame}
          >again</button>
        </div>
      )}
    </div>
    </div>
  );
}
