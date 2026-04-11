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

const CELL_W_HALF = Math.round(CELL_W / 2); // pre-computed column half-width
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
  const c = "rgba(255,255,255,0.95)";
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
// card symbol (large). The viewBox is always "0 0 11 18" so the aspect ratio
// stays consistent regardless of the rendered width/height.
function BombSVG({ width = 11, height = 18 }) {
  const c = "#3366cc";
  return (
    <svg width={width} height={height} viewBox="0 0 11 18" fill="none" role="img" aria-label="bomb">
      {/* Detonator cap – small narrow rectangle at top */}
      <rect x="3.5" y="0" width="4" height="4" fill={c} />
      {/* Body – wider rectangle */}
      <rect x="1.5" y="4" width="8" height="14" fill={c} />
    </svg>
  );
}

function Bomb() {
  return <BombSVG width={11} height={18} />;
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
  symbol: <BombSVG width={28} height={46} />,
  name: "blitz",
  description: "drop bombs, clear the runway",
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

  // Mutable refs – read/written inside setTimeout / setInterval callbacks
  const phaseRef    = useRef("idle");
  const planeColRef = useRef(0);
  const planeRowRef = useRef(0);
  const passRef     = useRef(0);
  const bombRef     = useRef(null);
  const buildRef    = useRef(null);
  const planeTimer  = useRef(null);

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
        // Hit building – remove top floor
        const nb = [...buildRef.current];
        nb[col]  = Math.max(0, nb[col] - 1);
        buildRef.current = nb;
        setBuildings([...nb]);
        setScore(s => s + SCORE_PER_FLOOR);
        playBlast();
        bombRef.current = null;
        setBomb(null);
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

  // ── best score ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "done") setBest(b => Math.max(b, score));
  }, [phase, score]);

  // ── shared styles ─────────────────────────────────────────────────────────
  const BtnStyle = {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.22)",
    color: "#fff",
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
    color: "rgba(255,255,255,0.38)",
    cursor: "pointer", padding: 6,
    lineHeight: 0,
    transition: "color 0.2s",
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: "100vw", height: "100dvh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
    <div style={{
      position: "relative",
      width: 430,
      height: 760,
      maxWidth: "100%",
      maxHeight: "100%",
      overflow: "hidden",
      userSelect: "none",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      touchAction: "none",
      outline: "1px solid rgba(255,255,255,0.07)",
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
      `}</style>

      {/* ── SOUND TOGGLE ── */}
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

      {/* ── HUB ── */}
      <button
        aria-label="back to hub"
        onClick={() => navigate("/")}
        onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
        onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.38)"}
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
          <div style={{ color:"#fff", fontSize:11, letterSpacing:6, marginBottom:32, opacity:0.28, textTransform:"uppercase" }}>blitz</div>
          <div style={{ color:"#fff", fontSize:64, fontWeight:300, lineHeight:1 }}>▶</div>
          <div style={{ color:"#fff", fontSize:9, letterSpacing:3, marginTop:32, opacity:0.28, textAlign:"center", lineHeight:2.2, textTransform:"uppercase" }}>
            drop bombs<br/>clear the runway
          </div>
          {best > 0 && (
            <div style={{ color:"#fff", fontSize:11, letterSpacing:3, marginTop:48, opacity:0.18 }}>best {best}</div>
          )}
          <button
            style={{ ...BtnStyle, marginTop: best > 0 ? 32 : 56 }}
            onMouseEnter={e => e.target.style.borderColor = "rgba(255,255,255,0.6)"}
            onMouseLeave={e => e.target.style.borderColor = "rgba(255,255,255,0.22)"}
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
            color: "#fff", fontSize: 32, fontWeight: 300, letterSpacing: -1,
          }}>{score}</div>

          {/* Game grid */}
          <div
            onPointerDown={dropBomb}
            style={{
              position: "absolute",
              top: (760 - GRID_H) / 2,
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
              background: "rgba(255,255,255,0.15)",
            }} />

            {/* Buildings */}
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
                    background: "rgba(255,255,255,0.70)",
                    backgroundImage: `
                      repeating-linear-gradient(
                        to bottom,
                        transparent 0px,
                        transparent ${CELL_H - 2}px,
                        rgba(10,10,10,0.32) ${CELL_H - 2}px,
                        rgba(10,10,10,0.32) ${CELL_H}px
                      ),
                      repeating-linear-gradient(
                        to right,
                        rgba(10,10,10,0.10) 0px,
                        rgba(10,10,10,0.10) 1px,
                        transparent 1px,
                        transparent ${CELL_W_HALF}px,
                        rgba(10,10,10,0.10) ${CELL_W_HALF}px,
                        rgba(10,10,10,0.10) ${CELL_W_HALF + 1}px,
                        transparent ${CELL_W_HALF + 1}px,
                        transparent ${Math.round(CELL_W)}px
                      )
                    `,
                    boxSizing: "border-box",
                    overflow: "visible",
                  }}
                >
                  <BuildingCap width={CELL_W - 1} />
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
          </div>

          {/* Hint */}
          <div style={{
            position: "absolute",
            bottom: 14,
            width: "100%",
            textAlign: "center",
            color: "#fff",
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
          <div style={{ color:"#fff", fontSize:11, letterSpacing:6, opacity:0.28, textTransform:"uppercase", marginBottom:16 }}>score</div>
          <div style={{ color:"#fff", fontSize:88, fontWeight:300, letterSpacing:-4, lineHeight:1 }}>{score}</div>
          {score > 0 && score >= best
            ? <div style={{ color:"#fff", fontSize:10, letterSpacing:5, opacity:0.32, marginTop:12, textTransform:"uppercase" }}>new best</div>
            : <div style={{ color:"#fff", fontSize:10, letterSpacing:4, opacity:0.2,  marginTop:12 }}>best {best}</div>
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
