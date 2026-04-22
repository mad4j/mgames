import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const WORLD_W = 430;
const WORLD_H = 760;
const GROUND_Y = 620;

const PLAYER_X = 88;
const PLAYER_SIZE = 36;
const JUMP_V = 880;
const GRAVITY = 2300;

const BASE_SPEED = 250;
const MAX_SPEED = 520;
const SPEED_GAIN = 12;

const OBSTACLE_MIN_GAP = 0.9;
const OBSTACLE_MAX_GAP = 1.8;
const FIRST_OBSTACLE_DELAY = OBSTACLE_MIN_GAP;

const randomGap = () => OBSTACLE_MIN_GAP + Math.random() * (OBSTACLE_MAX_GAP - OBSTACLE_MIN_GAP);

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
  path: "/run",
  symbol: "▭",
  name: "Run!!",
  description: "jump over obstacles and survive",
  status: "final",
};

export default function RunGame() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState("idle");
  const [playerY, setPlayerY] = useState(0);
  const [obstacles, setObstacles] = useState([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [squash, setSquash] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : WORLD_W,
    h: typeof window !== "undefined" ? window.innerHeight : WORLD_H,
  }));

  const gameRef = useRef({
    running: false,
    tPrev: 0,
    vy: 0,
    y: 0,
    speed: BASE_SPEED,
    distance: 0,
    spawnIn: FIRST_OBSTACLE_DELAY,
    id: 0,
    obstacles: [],
    squashT: 0,
  });
  const rafRef = useRef(null);

  const stopLoop = useCallback(() => {
    gameRef.current.running = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const endGame = useCallback(() => {
    stopLoop();
    setPhase("done");
    setBest((b) => Math.max(b, Math.floor(gameRef.current.distance / 12)));
  }, [stopLoop]);

  const jump = useCallback(() => {
    if (phase !== "playing") return;
    if (gameRef.current.y !== 0) return;
    gameRef.current.vy = JUMP_V;
  }, [phase]);

  const startGame = useCallback(() => {
    const g = gameRef.current;
    g.running = true;
    g.tPrev = performance.now();
    g.vy = 0;
    g.y = 0;
    g.speed = BASE_SPEED;
    g.distance = 0;
    g.spawnIn = FIRST_OBSTACLE_DELAY;
    g.obstacles = [];
    g.squashT = 0;

    setPlayerY(0);
    setObstacles([]);
    setScore(0);
    setSquash(0);
    setPhase("playing");
  }, []);

  const update = useCallback((now) => {
    const g = gameRef.current;
    if (!g.running) return;

    const dt = Math.min(0.033, (now - g.tPrev) / 1000);
    g.tPrev = now;

    g.speed = Math.min(MAX_SPEED, g.speed + SPEED_GAIN * dt);

    if (g.squashT > 0) {
      g.squashT = Math.max(0, g.squashT - dt);
      setSquash(g.squashT);
    }

    if (g.y > 0 || g.vy > 0) {
      g.vy -= GRAVITY * dt;
      g.y += g.vy * dt;
      if (g.y < 0) {
        g.y = 0;
        g.vy = 0;
        g.squashT = 0.14;
        setSquash(0.14);
      }
      setPlayerY(g.y);
    }

    g.spawnIn -= dt;
    if (g.spawnIn <= 0) {
      const h = 34 + Math.random() * 44;
      const w = 14 + Math.random() * 20;
      g.obstacles.push({
        id: g.id++,
        x: WORLD_W + 30,
        w,
        h,
      });
      g.spawnIn = randomGap();
    }

    g.obstacles = g.obstacles
      .map((o) => ({ ...o, x: o.x - g.speed * dt }))
      .filter((o) => o.x + o.w > -20);

    const pLeft = PLAYER_X + 6;
    const pRight = PLAYER_X + PLAYER_SIZE - 6;
    const pBottom = GROUND_Y - g.y - 4;
    const pTop = pBottom - PLAYER_SIZE + 8;

    const hit = g.obstacles.some((o) => {
      const oLeft = o.x;
      const oRight = o.x + o.w;
      const oTop = GROUND_Y - o.h;
      const oBottom = GROUND_Y;
      return pRight > oLeft && pLeft < oRight && pBottom > oTop && pTop < oBottom;
    });

    if (hit) {
      setObstacles(g.obstacles);
      endGame();
      return;
    }

    g.distance += g.speed * dt;
    setScore(Math.floor(g.distance / 12));
    setObstacles(g.obstacles);

    rafRef.current = requestAnimationFrame(update);
  }, [endGame]);

  useEffect(() => {
    if (phase !== "playing") return;
    rafRef.current = requestAnimationFrame(update);
    return stopLoop;
  }, [phase, update, stopLoop]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (phase === "idle" || phase === "done") startGame();
        else jump();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, jump, startGame]);

  useEffect(() => {
    return stopLoop;
  }, [stopLoop]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const buttonStyle = {
    background: "transparent",
    border: "1px solid var(--mg-color-text-subtle)",
    color: "var(--mg-color-text-primary)",
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: 5,
    padding: "14px 32px",
    cursor: "pointer",
    textTransform: "uppercase",
  };
  const scaleX = viewport.w / WORLD_W;
  const scaleY = viewport.h / WORLD_H;
  const squashRatio = Math.min(1, squash / 0.14);
  const playerScaleX = phase === "done" ? 1.22 : 1 + 0.15 * squashRatio;
  const playerScaleY = phase === "done" ? 0.78 : 1 - 0.12 * squashRatio;

  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        background: "var(--mg-color-background)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onPointerDown={() => {
          if (phase === "idle" || phase === "done") startGame();
          else jump();
        }}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
          outline: "1px dashed var(--mg-color-text-subtle)",
          fontFamily: "'DM Mono', 'Courier New', monospace",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: WORLD_W,
            height: WORLD_H,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: "top left",
          }}
        >
          <button
            aria-label="back to hub"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => navigate("/")}
            style={{
              position: "absolute",
              right: 12,
              top: 14,
              zIndex: 20,
              background: "transparent",
              border: "none",
              color: "var(--mg-color-text-dim)",
              cursor: "pointer",
              padding: 6,
              lineHeight: 0,
            }}
          >
            <IconHub />
          </button>

          <div
            style={{
              position: "absolute",
              left: 18,
              top: 20,
              color: "var(--mg-color-text-primary)",
              fontSize: 32,
              fontWeight: 300,
              letterSpacing: -1,
              opacity: phase === "idle" ? 0.25 : 1,
            }}
          >
            {score}
          </div>

          {phase !== "playing" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--mg-color-text-primary)",
                pointerEvents: "none",
              }}
            >
              <div style={{ fontSize: 12, letterSpacing: 6, opacity: 0.35, textTransform: "uppercase" }}>run!!</div>
              <div style={{ marginTop: 18, fontSize: 10, letterSpacing: 2.5, opacity: 0.3 }}>tap / space to jump</div>
              {phase === "done" && (
                <div style={{ marginTop: 24, fontSize: 11, letterSpacing: 4, opacity: 0.32, textTransform: "uppercase" }}>
                  game over
                </div>
              )}
              {best > 0 && (
                <div style={{ marginTop: 12, fontSize: 10, letterSpacing: 3, opacity: 0.2 }}>
                  best {best}
                </div>
              )}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={startGame}
                style={{ ...buttonStyle, marginTop: 44, pointerEvents: "auto" }}
              >
                {phase === "done" ? "again" : "start"}
              </button>
            </div>
          )}

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: GROUND_Y,
              height: 2,
              background: "var(--mg-color-border-soft)",
              opacity: 0.9,
            }}
          />

          <div
            style={{
              position: "absolute",
              left: PLAYER_X,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
              bottom: WORLD_H - (GROUND_Y - playerY),
              borderRadius: "50%",
              border: "1.5px solid var(--mg-color-text-high)",
              background: "var(--mg-color-surface-soft)",
              transformOrigin: "50% 100%",
              transition: phase === "playing" ? "transform 0.06s linear" : "transform 0.2s ease",
              transform: `scaleX(${playerScaleX}) scaleY(${playerScaleY})`,
            }}
          />

          {obstacles.map((o) => (
            <div
              key={o.id}
              style={{
                position: "absolute",
                left: o.x,
                width: o.w,
                height: o.h,
                top: GROUND_Y - o.h,
                border: "1.5px solid var(--mg-color-text-emphasis)",
                background: "var(--mg-color-surface-soft)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
