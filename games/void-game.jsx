import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const GAME_SECONDS = 120;
const TOTAL_DOTS = 120;
const START_GRACE_MS = 350;
const MOTION_THRESHOLD = 1.8;
const ORIENTATION_THRESHOLD = 9;

function useSound() {
  const ctxRef = useRef(null);
  const enabledRef = useRef(true);
  const [soundOn, _setSoundOn] = useState(true);

  const setSoundOn = (value) => {
    enabledRef.current = value;
    _setSoundOn(value);
  };

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playTone = useCallback((freq, duration, type = "sine", gainValue = 0.15, delay = 0) => {
    if (!enabledRef.current) return;
    try {
      const ctx = getCtx();
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    } catch (_) {
      /* ignore AudioContext errors */
    }
  }, [getCtx]);

  const playWin = useCallback(() => {
    playTone(523.25, 0.12, "sine", 0.16, 0.00);
    playTone(659.25, 0.14, "sine", 0.15, 0.12);
    playTone(783.99, 0.16, "sine", 0.14, 0.25);
    playTone(1046.5, 0.35, "sine", 0.16, 0.38);
  }, [playTone]);

  const playLose = useCallback(() => {
    playTone(120, 0.38, "triangle", 0.2, 0);
    playTone(82.41, 0.45, "sine", 0.16, 0.08);
  }, [playTone]);

  return { soundOn, setSoundOn, playWin, playLose };
}

function IconSound({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="2,6 6,6 10,2 10,16 6,12 2,12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      {on ? (
        <>
          <path d="M12.5 6.5 C13.8 7.3 13.8 10.7 12.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M14.5 4.5 C17 6 17 12 14.5 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <line x1="12" y1="6" x2="17" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="17" y1="6" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function IconHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="10" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="2" y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="10" y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export const meta = {
  path: "/void",
  symbol: "◌",
  name: "void",
  description: "do absolutely nothing for 120 seconds",
  status: "final",
};

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
  position: "absolute",
  top: 14,
  zIndex: 20,
  background: "transparent",
  border: "none",
  color: "rgba(255,255,255,0.38)",
  cursor: "pointer",
  padding: 6,
  lineHeight: 0,
  transition: "color 0.2s",
};

export default function VoidGame() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("idle");
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [score, setScore] = useState(0);
  const phaseRef = useRef("idle");
  const startAtRef = useRef(0);
  const tickIntervalRef = useRef(null);
  const motionBaselineRef = useRef(null);
  const orientationBaselineRef = useRef(null);
  const wakeLockRef = useRef(null);
  const wakeLockRequestingRef = useRef(false);
  const { soundOn, setSoundOn, playWin, playLose } = useSound();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const getElapsedSeconds = useCallback(() => {
    if (!startAtRef.current) return 0;
    const elapsedMs = Date.now() - startAtRef.current;
    return Math.max(0, Math.min(GAME_SECONDS, Math.floor(elapsedMs / 1000)));
  }, []);

  const stopTimer = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!wakeLock) return;
    try {
      await wakeLock.release();
    } catch (_) {
      /* ignore Wake Lock release errors */
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLockRef.current || wakeLockRequestingRef.current) return;
    wakeLockRequestingRef.current = true;
    try {
      const wakeLock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = wakeLock;
      wakeLock.addEventListener("release", () => {
        if (wakeLockRef.current === wakeLock) wakeLockRef.current = null;
      });
    } catch (_) {
      /* ignore Wake Lock request errors */
    } finally {
      wakeLockRequestingRef.current = false;
    }
  }, []);

  const endLost = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    stopTimer();
    setScore(getElapsedSeconds());
    phaseRef.current = "lost";
    setPhase("lost");
    playLose();
  }, [getElapsedSeconds, playLose, stopTimer]);

  const startGame = useCallback(() => {
    stopTimer();
    motionBaselineRef.current = null;
    orientationBaselineRef.current = null;
    setTimeLeft(GAME_SECONDS);
    setScore(0);
    phaseRef.current = "playing";
    setPhase("playing");
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  useEffect(() => {
    if (phase !== "playing") {
      releaseWakeLock();
      return;
    }

    requestWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      releaseWakeLock();
    };
  }, [phase, releaseWakeLock, requestWakeLock]);

  useEffect(() => {
    if (phase !== "playing") return;
    const startedAt = Date.now();
    startAtRef.current = startedAt;
    setTimeLeft(GAME_SECONDS);
    tickIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, GAME_SECONDS - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        stopTimer();
        setScore(GAME_SECONDS);
        phaseRef.current = "won";
        setPhase("won");
        playWin();
      }
    }, 100);
    return () => stopTimer();
  }, [phase, playWin, stopTimer]);

  useEffect(() => {
    if (phase !== "playing") return;

    const inGrace = () => Date.now() - startAtRef.current < START_GRACE_MS;
    const onAnyAction = () => {
      if (inGrace()) return;
      endLost();
    };

    const onVisibilityChange = () => {
      if (document.hidden) onAnyAction();
    };

    const onMotion = (event) => {
      if (inGrace()) return;
      const a = event.accelerationIncludingGravity || event.acceleration;
      if (!a) return;
      const current = {
        x: Number.isFinite(a.x) ? a.x : 0,
        y: Number.isFinite(a.y) ? a.y : 0,
        z: Number.isFinite(a.z) ? a.z : 0,
      };
      const baseline = motionBaselineRef.current;
      if (!baseline) {
        motionBaselineRef.current = current;
        return;
      }
      const delta =
        Math.abs(current.x - baseline.x) +
        Math.abs(current.y - baseline.y) +
        Math.abs(current.z - baseline.z);
      motionBaselineRef.current = {
        x: baseline.x * 0.9 + current.x * 0.1,
        y: baseline.y * 0.9 + current.y * 0.1,
        z: baseline.z * 0.9 + current.z * 0.1,
      };
      if (delta > MOTION_THRESHOLD) endLost();
    };

    const onOrientation = (event) => {
      if (inGrace()) return;
      const current = {
        beta: Number.isFinite(event.beta) ? event.beta : 0,
        gamma: Number.isFinite(event.gamma) ? event.gamma : 0,
      };
      const baseline = orientationBaselineRef.current;
      if (!baseline) {
        orientationBaselineRef.current = current;
        return;
      }
      const delta = Math.abs(current.beta - baseline.beta) + Math.abs(current.gamma - baseline.gamma);
      orientationBaselineRef.current = {
        beta: baseline.beta * 0.9 + current.beta * 0.1,
        gamma: baseline.gamma * 0.9 + current.gamma * 0.1,
      };
      if (delta > ORIENTATION_THRESHOLD) endLost();
    };

    window.addEventListener("pointerdown", onAnyAction, { passive: true });
    window.addEventListener("mousemove", onAnyAction, { passive: true });
    window.addEventListener("keydown", onAnyAction);
    window.addEventListener("touchstart", onAnyAction, { passive: true });
    window.addEventListener("blur", onAnyAction);
    window.addEventListener("pagehide", onAnyAction);
    window.addEventListener("orientationchange", onAnyAction);
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("deviceorientation", onOrientation);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pointerdown", onAnyAction);
      window.removeEventListener("mousemove", onAnyAction);
      window.removeEventListener("keydown", onAnyAction);
      window.removeEventListener("touchstart", onAnyAction);
      window.removeEventListener("blur", onAnyAction);
      window.removeEventListener("pagehide", onAnyAction);
      window.removeEventListener("orientationchange", onAnyAction);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrientation);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [phase, endLost]);

  const visibleDots = Math.max(0, Math.ceil((timeLeft / GAME_SECONDS) * TOTAL_DOTS));
  const scoreLabel = `${score} second${score === 1 ? "" : "s"}`;

  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="game-area"
        style={{
          position: "relative",
          width: 520,
          height: 760,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "hidden",
          userSelect: "none",
          fontFamily: "'DM Mono', 'Courier New', monospace",
          outline: "1px dashed rgba(255,255,255,0.12)",
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <button
          aria-label={soundOn ? "mute" : "unmute"}
          onClick={() => setSoundOn(!soundOn)}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = soundOn ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.18)")}
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
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.38)")}
          style={{ ...iconBtnStyle, right: 12 }}
        >
          <IconHub />
        </button>

        {phase === "idle" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              animation: "fadeIn 0.6s ease",
            }}
          >
            <div style={{ color: "#fff", fontSize: 11, letterSpacing: 6, opacity: 0.28, textTransform: "uppercase", marginBottom: 20 }}>void</div>
            <div aria-hidden="true" style={{ color: "#fff", fontSize: 72, fontWeight: 300, lineHeight: 1, marginBottom: 20 }}>
              ◌
            </div>
            <div style={{ color: "#fff", fontSize: 10, letterSpacing: 3, opacity: 0.18, textAlign: "center", lineHeight: 1.8 }}>
              do nothing for 120 seconds
            </div>
            <button
              style={{ ...BtnStyle, marginTop: 56 }}
              onMouseEnter={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.6)")}
              onMouseLeave={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.22)")}
              onClick={startGame}
            >
              start
            </button>
          </div>
        )}

        {phase === "playing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "fadeIn 0.35s ease",
            }}
          >
            <div style={{ position: "relative", width: "76%", aspectRatio: "1 / 1" }}>
              {Array.from({ length: TOTAL_DOTS }).map((_, i) => {
                const angle = (i / TOTAL_DOTS) * Math.PI * 2 - Math.PI / 2;
                const x = 50 + Math.cos(angle) * 46;
                const y = 50 + Math.sin(angle) * 46;
                const visible = i < visibleDots;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: "translate(-50%,-50%)",
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "#fff",
                      opacity: visible ? 0.92 : 0.06,
                      transition: "opacity 0.28s linear",
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {phase === "won" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              animation: "fadeIn 0.6s ease",
            }}
          >
            <div style={{ color: "#fff", fontSize: 11, letterSpacing: 6, opacity: 0.28, textTransform: "uppercase", marginBottom: 16 }}>victory</div>
            <div style={{ color: "#fff", fontSize: 10, letterSpacing: 3, opacity: 0.2, textTransform: "uppercase" }}>void complete</div>
            <div
              role="status"
              aria-label={`score ${scoreLabel}`}
              style={{ color: "#fff", fontSize: 10, letterSpacing: 3, opacity: 0.55, textTransform: "uppercase", marginTop: 14 }}
            >
              score {scoreLabel}
            </div>
            <button
              style={{ ...BtnStyle, marginTop: 56 }}
              onMouseEnter={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.6)")}
              onMouseLeave={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.22)")}
              onClick={startGame}
            >
              again
            </button>
          </div>
        )}

        {phase === "lost" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              animation: "fadeIn 0.6s ease",
            }}
          >
            <div style={{ color: "#fff", fontSize: 11, letterSpacing: 6, opacity: 0.28, textTransform: "uppercase", marginBottom: 16 }}>game over</div>
            <div style={{ color: "#fff", fontSize: 10, letterSpacing: 3, opacity: 0.2, textTransform: "uppercase" }}>you did something</div>
            <div
              role="status"
              aria-label={`score ${scoreLabel}`}
              style={{ color: "#fff", fontSize: 10, letterSpacing: 3, opacity: 0.55, textTransform: "uppercase", marginTop: 14 }}
            >
              score {scoreLabel}
            </div>
            <button
              style={{ ...BtnStyle, marginTop: 56 }}
              onMouseEnter={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.6)")}
              onMouseLeave={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.22)")}
              onClick={startGame}
            >
              retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
