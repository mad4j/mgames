import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { HubButton, SoundToggleButton } from "../src/game-controls.jsx";

const GAME_DURATION = 20;
const DOT_LIFETIME  = 1400;  // ms before a dot expires
const MAX_DOTS      = 2;     // max dots on screen at once
const FALLBACK_MS   = 900;   // spawn a dot automatically if screen is empty too long
const SPAWN_DELAY   = 120;   // ms after a tap before the new dot appears

// ── audio ──────────────────────────────────────────────────────
const HAPPY_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // C5 D5 E5 G5 A5 C6

function useSound() {
  const ctxRef     = useRef(null);
  const enabledRef = useRef(true);
  const [soundOn, _setSoundOn] = useState(true);

  const setSoundOn = (v) => {
    enabledRef.current = v;
    _setSoundOn(v);
  };

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };

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
  }, []);

  const playTick = useCallback((alt) => {
    // alternating hi/lo click for tic-tac feel
    playTone(alt ? 1760 : 1320, 0.04, "square", 0.07);
  }, [playTone]);

  const playHit = useCallback(() => {
    const freq = HAPPY_NOTES[Math.floor(Math.random() * HAPPY_NOTES.length)];
    playTone(freq, 0.22, "sine", 0.18);
  }, [playTone]);

  const playMiss = useCallback(() => {
    playTone(110, 0.35, "sine", 0.22);
  }, [playTone]);

  return { soundOn, setSoundOn, playTick, playHit, playMiss };
}

function generateDot(id) {
  const size = 48 + Math.random() * 36;
  return {
    id,
    x: 8  + Math.random() * 84,
    y: 14 + Math.random() * 70,
    size,
    born: Date.now(),
    popped: false,
  };
}

function Ripple({ x, y, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "absolute",
      left: `${x}%`, top: `${y}%`,
      transform: "translate(-50%,-50%)",
      width: 64, height: 64,
      borderRadius: "50%",
      border: "1.5px solid var(--mg-color-border-soft)",
      animation: "ripple 0.5s ease-out forwards",
      pointerEvents: "none",
    }} />
  );
}

export const meta = {
  path: "/tap",
  symbol: "●",
  name: "tap",
  description: "pop the dots before they vanish",
  status: "final",
};

export default function TapGame() {
  const [phase,   setPhase]   = useState("idle");
  const navigate = useNavigate();
  const [dots,    setDots]    = useState([]);
  const [score,   setScore]   = useState(0);
  const [timeLeft,setTimeLeft]= useState(GAME_DURATION);
  const [ripples, setRipples] = useState([]);
  const [best,    setBest]    = useState(0);
  const [combo,   setCombo]   = useState(0);
  const [burst,   setBurst]   = useState(null);  // { key, type:'multi'|'miss', value? }

  const nextId    = useRef(0);
  const rippleId  = useRef(0);
  const burstId   = useRef(0);
  const timeLeftRef = useRef(GAME_DURATION);
  const tickAltRef  = useRef(false);

  const { soundOn, setSoundOn, playTick, playHit, playMiss } = useSound();

  // ── helpers ──────────────────────────────────────────────
  const spawnDot = useCallback(() => {
    setDots(d => {
      const alive = d.filter(x => !x.popped);
      if (alive.length >= MAX_DOTS) return d;
      return [...d.slice(-6), generateDot(nextId.current++)];
    });
  }, []);

  const showBurst = useCallback((type, value) => {
    setBurst({ key: burstId.current++, type, value });
  }, []);

  // ── start ─────────────────────────────────────────────────
  const startGame = () => {
    setDots([]);
    setScore(0);
    setCombo(0);
    setBurst(null);
    setRipples([]);
    setTimeLeft(GAME_DURATION);
    timeLeftRef.current = GAME_DURATION;
    tickAltRef.current  = false;
    setPhase("playing");
  };

  // First dot + fallback spawner (kicks in only when screen is empty too long)
  useEffect(() => {
    if (phase !== "playing") return;
    // Spawn first dot immediately
    const first = setTimeout(spawnDot, 80);
    // Fallback: if player is too slow or misses, keep things moving
    const fb = setInterval(spawnDot, FALLBACK_MS);
    return () => { clearTimeout(first); clearInterval(fb); };
  }, [phase, spawnDot]);

  // Expire dots → miss + burst
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      const now = Date.now();
      setDots(d => {
        const expired = d.filter(x => !x.popped && now - x.born > DOT_LIFETIME);
        if (expired.length > 0) {
          setCombo(0);
          showBurst("miss");
          playMiss();
          // spawn a replacement after a small pause
          setTimeout(spawnDot, 300);
        }
        return d.filter(x => x.popped || now - x.born <= DOT_LIFETIME);
      });
    }, 80);
    return () => clearInterval(iv);
  }, [phase, showBurst, spawnDot, playMiss]);

  // Timer
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      setTimeLeft(t => {
        const next = t <= 1 ? 0 : t - 1;
        timeLeftRef.current = next;
        if (next === 0) setPhase("done");
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [phase]);

  // Tic-tac: self-rescheduling tick whose speed grows as time runs out
  useEffect(() => {
    if (phase !== "playing") return;
    let timeoutId;
    const tickDelay = (t) => 200 + 800 * (t / GAME_DURATION);
    const tick = () => {
      tickAltRef.current = !tickAltRef.current;
      playTick(tickAltRef.current);
      timeoutId = setTimeout(tick, tickDelay(timeLeftRef.current));
    };
    timeoutId = setTimeout(tick, tickDelay(timeLeftRef.current));
    return () => clearTimeout(timeoutId);
  }, [phase, playTick]);

  // ── tap ───────────────────────────────────────────────────
  const popDot = useCallback((dot, e) => {
    e.stopPropagation();
    if (dot.popped || phase !== "playing") return;

    // Mark popped
    setDots(d => d.map(x => x.id === dot.id ? { ...x, popped: true } : x));

    // Combo + multiplier burst
    setCombo(c => {
      const next     = c + 1;
      const multi    = 1 + Math.floor(next / 3);
      const prevMulti= 1 + Math.floor(c / 3);
      if (multi > 1 && multi !== prevMulti) showBurst("multi", multi);
      return next;
    });

    // Score
    setScore(s => s + (1 + Math.floor(combo / 3)));

    // Ripple feedback
    setRipples(r => [...r, { id: rippleId.current++, x: dot.x, y: dot.y }]);

    // Sound
    playHit();

    // ✦ Speed reward: new dot appears quickly after each tap
    setTimeout(spawnDot, SPAWN_DELAY);
  }, [phase, combo, showBurst, spawnDot, playHit]);

  useEffect(() => {
    if (phase === "done") setBest(b => Math.max(b, score));
  }, [phase, score]);

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

  // ── render ────────────────────────────────────────────────
  const timerFrac = timeLeft / GAME_DURATION;

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
      height: 760,
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

        @keyframes ripple {
          from { transform: translate(-50%,-50%) scale(0.4); opacity: 1; }
          to   { transform: translate(-50%,-50%) scale(2.6); opacity: 0; }
        }
        @keyframes appear {
          from { transform: translate(-50%,-50%) scale(0); opacity: 0; }
          to   { transform: translate(-50%,-50%) scale(1); opacity: 1; }
        }
        @keyframes pop {
          from { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
          to   { transform: translate(-50%,-50%) scale(1.7); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes burstMulti {
          0%   { opacity: 0;    transform: translate(-50%,-50%) scale(0.78); }
          14%  { opacity: 0.08; transform: translate(-50%,-50%) scale(1.01); }
          65%  { opacity: 0.06; transform: translate(-50%,-50%) scale(1);    }
          100% { opacity: 0;    transform: translate(-50%,-50%) scale(0.97); }
        }
        @keyframes burstMiss {
          0%   { opacity: 0;    transform: translate(-50%,-50%) scale(0.6);  }
          12%  { opacity: 0.13; transform: translate(-50%,-50%) scale(1.04); }
          60%  { opacity: 0.10; transform: translate(-50%,-50%) scale(1);    }
          100% { opacity: 0;    transform: translate(-50%,-50%) scale(0.92); }
        }
      `}</style>

      {/* ── SOUND TOGGLE + HUB (always visible) ── */}
      <SoundToggleButton soundOn={soundOn} setSoundOn={setSoundOn} />
      <HubButton onClick={() => navigate("/")} />

      {/* ── IDLE ── */}
      {phase === "idle" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.6s ease",
        }}>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:11, letterSpacing:6, marginBottom:32, opacity:0.28, textTransform:"uppercase" }}>tap</div>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:72, fontWeight:300, lineHeight:1 }}>●</div>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:11, letterSpacing:6, marginTop:32, opacity:0.28, textTransform:"uppercase" }}>{GAME_DURATION}s</div>
          {best > 0 && <div style={{ color:"var(--mg-color-text-primary)", fontSize:11, letterSpacing:3, marginTop:48, opacity:0.18 }}>best {best}</div>}
          <button
            style={{ ...BtnStyle, marginTop:56 }}
            onMouseEnter={e => e.target.style.borderColor="rgba(15,20,25,0.6)"}
            onMouseLeave={e => e.target.style.borderColor="var(--mg-color-text-subtle)"}
            onClick={startGame}
          >start</button>
        </div>
      )}

      {/* ── PLAYING ── */}
      {phase === "playing" && (
        <>
          <div style={{
            position:"absolute", top:18, left:24, zIndex:10,
            color:"var(--mg-color-text-primary)", fontSize:32, fontWeight:300, letterSpacing:-1,
          }}>{score}</div>

          {/* Central burst */}
          {burst && (
            <div
              key={burst.key}
              style={{
                position:"absolute", left:"50%", top:"50%",
                fontSize:"36vw", fontWeight:300, color:"var(--mg-color-text-primary)",
                lineHeight:1, pointerEvents:"none", zIndex:5,
                whiteSpace:"nowrap",
                animation: burst.type === "multi"
                  ? "burstMulti 0.9s ease forwards"
                  : "burstMiss 0.65s ease forwards",
              }}
              onAnimationEnd={() => setBurst(null)}
            >
              {burst.type === "multi" ? `×${burst.value}` : "✕"}
            </div>
          )}

          {/* Dots */}
          {dots.map(dot => {
            const age     = Date.now() - dot.born;
            const opacity = dot.popped ? 0 : Math.max(0, 1 - age / DOT_LIFETIME);
            return (
              <div
                key={dot.id}
                onPointerDown={e => popDot(dot, e)}
                style={{
                  position: "absolute",
                  left: `${dot.x}%`, top: `${dot.y}%`,
                  width: dot.size, height: dot.size,
                  borderRadius: "50%",
                  border: `1.5px solid rgba(15,20,25,${opacity * 0.88})`,
                  background: `rgba(15,20,25,${opacity * 0.05})`,
                  transform: "translate(-50%,-50%)",
                  cursor: "pointer",
                  animation: dot.popped
                    ? "pop 0.22s ease forwards"
                    : "appear 0.16s cubic-bezier(0.34,1.56,0.64,1) forwards",
                }}
              />
            );
          })}

          {/* Ripples */}
          {ripples.map(r => (
            <Ripple key={r.id} x={r.x} y={r.y}
              onDone={() => setRipples(rs => rs.filter(x => x.id !== r.id))} />
          ))}

          {/* Timer bar */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0, height:5,
            background:"var(--mg-color-surface-soft)", zIndex:10,
          }}>
            <div style={{
              height:"100%",
              width:`${timerFrac * 100}%`,
              background: timerFrac < 0.3 ? "var(--mg-color-warning-soft)" : "var(--mg-color-border-soft)",
              transition:"width 1s linear, background 0.4s",
              boxShadow: timerFrac < 0.3 ? "0 0 10px var(--mg-color-warning-shadow)" : "none",
            }} />
          </div>
        </>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div style={{
          position:"absolute", inset:0,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          animation:"fadeIn 0.5s ease",
        }}>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:11, letterSpacing:6, opacity:0.28, textTransform:"uppercase", marginBottom:16 }}>score</div>
          <div style={{ color:"var(--mg-color-text-primary)", fontSize:88, fontWeight:300, letterSpacing:-4, lineHeight:1 }}>{score}</div>
          {score > 0 && score >= best
            ? <div style={{ color:"var(--mg-color-text-primary)", fontSize:10, letterSpacing:5, opacity:0.32, marginTop:12, textTransform:"uppercase" }}>new best</div>
            : <div style={{ color:"var(--mg-color-text-primary)", fontSize:10, letterSpacing:4, opacity:0.2,  marginTop:12 }}>best {best}</div>
          }
          <button
            style={{ ...BtnStyle, marginTop:56 }}
            onMouseEnter={e => e.target.style.borderColor="rgba(15,20,25,0.6)"}
            onMouseLeave={e => e.target.style.borderColor="var(--mg-color-text-subtle)"}
            onClick={startGame}
          >again</button>
        </div>
      )}
    </div>
    </div>
  );
}
