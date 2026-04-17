import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const FRAME_W = 430;
const FRAME_H = 760;
const HUD_TOP = 92;

const SHAPES = 5;
const SPAWN_MS = 360;
const GRAVITY = 0.22;
const MAX_VY = 6.8;
const OVERFLOW_MARGIN = 2;

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function Shape({ type, size = 18 }) {
  const c = size / 2;
  const r = size / 2 - 1;

  if (type === 0) return <circle cx={c} cy={c} r={r} stroke="currentColor" strokeWidth="1.6" fill="none" />;
  if (type === 1) return <rect x={c - r} y={c - r} width={r * 2} height={r * 2} stroke="currentColor" strokeWidth="1.6" fill="none" />;
  if (type === 2) return <polygon points={`${c},${c - r} ${c + r},${c + r} ${c - r},${c + r}`} stroke="currentColor" strokeWidth="1.6" fill="none" />;
  if (type === 3) return <polygon points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} stroke="currentColor" strokeWidth="1.6" fill="none" />;
  return (
    <path
      d={`M ${c} ${c - r} L ${c + r * 0.3} ${c - r * 0.3} L ${c + r} ${c} L ${c + r * 0.3} ${c + r * 0.3} L ${c} ${c + r} L ${c - r * 0.3} ${c + r * 0.3} L ${c - r} ${c} L ${c - r * 0.3} ${c - r * 0.3} Z`}
      stroke="currentColor"
      strokeWidth="1.6"
      fill="none"
    />
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

function spawnToken(tokens, nextIdRef, boardW, radius) {
  const y = -radius;
  const diameter = radius * 2;

  for (let i = 0; i < 36; i++) {
    const x = radius + Math.random() * (boardW - diameter);
    const blocked = tokens.some((token) => Math.hypot(token.x - x, token.y - y) < diameter - 1);
    if (blocked) continue;

    return {
      tokens: [
        ...tokens,
        {
          id: nextIdRef.current++,
          type: randomInt(SHAPES),
          x,
          y,
          vy: 0,
          motion: 0,
        },
      ],
      placed: true,
    };
  }

  return { tokens, placed: false };
}

function simulate(tokens, boardW, boardH, radius) {
  const floorY = boardH - radius;
  const diameter = radius * 2;

  const next = tokens.map((token) => {
    const vy = Math.min(MAX_VY, token.vy + GRAVITY);
    return {
      ...token,
      y: token.y + vy,
      vy,
      motion: token.motion + 1,
    };
  });

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < next.length; i++) {
      const token = next[i];
      let maxY = floorY;

      for (let j = 0; j < next.length; j++) {
        if (i === j) continue;
        const other = next[j];
        const dx = token.x - other.x;
        const absDx = Math.abs(dx);
        if (absDx >= diameter - 0.01) continue;

        const support = other.y - Math.sqrt(Math.max(0, diameter * diameter - absDx * absDx));
        if (support < maxY) maxY = support;
      }

      if (token.y > maxY) {
        token.y = maxY;
        token.vy = 0;
      }

      if (token.y > floorY) {
        token.y = floorY;
        token.vy = 0;
      }

      if (token.x < radius) token.x = radius;
      if (token.x > boardW - radius) token.x = boardW - radius;
    }
  }

  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= diameter - 0.01) continue;

      const overlap = diameter - dist;
      let nx = dx / dist;
      if (!Number.isFinite(nx)) nx = Math.random() > 0.5 ? 1 : -1;

      a.x += nx * (overlap * 0.5);
      b.x -= nx * (overlap * 0.5);
      if (a.y <= b.y) a.y -= overlap * 0.12;
      else b.y -= overlap * 0.12;

      if (a.x < radius) a.x = radius;
      if (a.x > boardW - radius) a.x = boardW - radius;
      if (b.x < radius) b.x = radius;
      if (b.x > boardW - radius) b.x = boardW - radius;
      if (a.y > floorY) a.y = floorY;
      if (b.y > floorY) b.y = floorY;
    }
  }

  return next;
}

function collectGroup(tokens, startId, connectDist) {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  const start = byId.get(startId);
  if (!start) return [];

  const seen = new Set([startId]);
  const stack = [startId];

  while (stack.length) {
    const current = stack.pop();
    const token = byId.get(current);
    if (!token) continue;

    for (const near of tokens) {
      if (near.type !== start.type || seen.has(near.id)) continue;
      if (Math.hypot(near.x - token.x, near.y - token.y) > connectDist) continue;
      seen.add(near.id);
      stack.push(near.id);
    }
  }

  return [...seen];
}

export const meta = {
  path: "/blast",
  symbol: "◉",
  name: "blast",
  description: "tap adjacent matching chains",
};

export default function BlastGame() {
  const navigate = useNavigate();
  const nextId = useRef(1);

  const [phase, setPhase] = useState("idle");
  const [tokens, setTokens] = useState([]);
  const [score, setScore] = useState(0);
  const [lastPop, setLastPop] = useState(0);
  const [viewport, setViewport] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : FRAME_W,
    h: typeof window !== "undefined" ? window.innerHeight : FRAME_H,
  });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const frameW = Math.min(FRAME_W, Math.max(280, viewport.w - 32));
  const frameH = Math.min(FRAME_H, Math.max(500, viewport.h - 32));

  const boardW = Math.max(240, frameW - 24);
  const boardH = Math.max(320, frameH - HUD_TOP - 24);
  const radius = Math.max(12, Math.min(20, Math.floor(boardW / 19)));
  const connectDist = radius * 2.2;

  const start = useCallback(() => {
    nextId.current = 1;
    setTokens([]);
    setScore(0);
    setLastPop(0);
    setPhase("playing");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const interval = setInterval(() => {
      setTokens((prev) => {
        const spawned = spawnToken(prev, nextId, boardW, radius);
        if (!spawned.placed) {
          setPhase("done");
          return prev;
        }
        return spawned.tokens;
      });
    }, SPAWN_MS);

    return () => clearInterval(interval);
  }, [phase, boardW, radius]);

  useEffect(() => {
    if (phase !== "playing") return;

    let raf;

    const loop = () => {
      setTokens((prev) => {
        const next = simulate(prev, boardW, boardH, radius);
        const overflow = next.some((token) => token.y <= radius + OVERFLOW_MARGIN && token.vy === 0);
        if (overflow) setPhase("done");
        return next;
      });
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, boardW, boardH, radius]);

  useEffect(() => {
    setTokens((prev) =>
      prev.map((token) => ({
        ...token,
        x: Math.max(radius, Math.min(boardW - radius, token.x)),
        y: Math.min(boardH - radius, token.y),
      }))
    );
  }, [boardW, boardH, radius]);

  const onTap = useCallback(
    (id) => {
      if (phase !== "playing") return;

      setTokens((prev) => {
        const group = collectGroup(prev, id, connectDist);
        if (group.length < 2) return prev;

        const removedIds = new Set(group);
        setScore((s) => s + group.length * group.length);
        setLastPop(group.length);
        return prev.filter((token) => !removedIds.has(token.id));
      });
    },
    [phase, connectDist]
  );

  const sortedTokens = useMemo(() => [...tokens].sort((a, b) => a.y - b.y), [tokens]);

  const iconBtnStyle = {
    position: "absolute",
    top: 14,
    right: 12,
    zIndex: 20,
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.38)",
    cursor: "pointer",
    padding: 6,
    lineHeight: 0,
    transition: "color 0.2s",
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Mono', 'Courier New', monospace",
      }}
    >
      <style>{`
        @keyframes popMsg {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          20% { opacity: 0.12; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.12); }
        }
      `}</style>

      <div
        style={{
          width: frameW,
          height: frameH,
          position: "relative",
          outline: "1px dashed rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <button
          aria-label="back to hub"
          onClick={() => navigate("/")}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.38)")}
          style={iconBtnStyle}
        >
          <IconHub />
        </button>

        {(phase === "playing" || phase === "done") && (
          <>
            <div style={{ position: "absolute", left: 20, top: 16, color: "rgba(255,255,255,0.9)", fontSize: 26 }}>{score}</div>
            {lastPop >= 2 && phase === "playing" && (
              <div
                key={`${lastPop}-${score}`}
                style={{
                  position: "absolute",
                  top: "48%",
                  left: "50%",
                  color: "rgba(255,255,255,0.95)",
                  fontSize: 58,
                  pointerEvents: "none",
                  animation: "popMsg 0.65s ease forwards",
                }}
              >
                {lastPop}
              </div>
            )}

            <div
              style={{
                position: "absolute",
                left: "50%",
                top: HUD_TOP,
                width: boardW,
                height: boardH,
                transform: "translateX(-50%)",
                border: "1px solid rgba(255,255,255,0.16)",
                boxSizing: "border-box",
              }}
            >
              {sortedTokens.map((token) => (
                <button
                  key={`${token.id}-${token.motion}`}
                  onPointerDown={() => onTap(token.id)}
                  style={{
                    position: "absolute",
                    left: token.x,
                    top: token.y,
                    width: radius * 2 - 4,
                    height: radius * 2 - 4,
                    borderRadius: "50%",
                    border: "1.5px solid rgba(255,255,255,0.75)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <Shape type={token.type} />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "idle" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.88)",
            }}
          >
            <div style={{ fontSize: 72, lineHeight: 1 }}>◉</div>
            <div style={{ marginTop: 20, fontSize: 11, letterSpacing: 4, opacity: 0.45, textTransform: "uppercase" }}>blast</div>
            <div style={{ marginTop: 10, fontSize: 10, letterSpacing: 2, opacity: 0.3, textAlign: "center", lineHeight: 1.7 }}>
              circles fall and stack.<br />tap groups to explode chains.
            </div>
            <button
              onClick={start}
              style={{
                marginTop: 48,
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.95)",
                padding: "14px 34px",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 4,
                cursor: "pointer",
              }}
            >
              start
            </button>
          </div>
        )}

        {phase === "done" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.9)",
              background: "rgba(10,10,10,0.52)",
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: 5, opacity: 0.3, textTransform: "uppercase" }}>game over</div>
            <div style={{ fontSize: 84, lineHeight: 1, marginTop: 8 }}>{score}</div>
            <button
              onClick={start}
              style={{
                marginTop: 30,
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.95)",
                padding: "14px 34px",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 4,
                cursor: "pointer",
              }}
            >
              again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
