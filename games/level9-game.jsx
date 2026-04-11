import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/* ═══════════════════════ PALETTE ═════════════════════════════ */
const C_BG   = "#0a0a0a";
const C_MAIN = "rgba(255,255,255,0.88)";
const C_NEAR = "rgba(255,255,255,1)";
const C_SCAN = "rgba(255,255,255,0.018)";

/* ═══════════════════════ CONSTANTS ═══════════════════════════ */
const P_R        = 13;   // player collision half-size
const LIVES_INIT = 3;
const BULLET_SPD = 7;
const SHOOT_INT  = 22;   // frames between auto-shots (max 3 bullets)
const B_HW       = 20;   // bird collision half-width
const B_HH       = 18;   // bird collision half-height
const BIRD_PTS   = 10;   // score per kill

/* ═══════════════════════ MOVEMENT PATTERNS ══════════════════ */
// Three visually distinct vertical-oscillation functions.
// Each bird is assigned one pattern at level start and keeps it forever.
// Adding a pattern: push a new (frame) => yOffset function here.
const BIRD_PATTERNS = [
  // 0 – slow, large-amplitude sine
  (t) => 34 * Math.sin(t * 0.022),
  // 1 – fast, small-amplitude sine
  (t) => 20 * Math.sin(t * 0.068),
  // 2 – sharp zigzag (triangle wave)
  (t) => {
    const period = 84;
    const phase  = ((t % period) + period) % period;
    return 28 * (phase < period * 0.5
      ? (4 * phase / period) - 1
      : (-4 * phase / period) + 3);
  },
];

/* ═══════════════════════ LEVEL DEFINITIONS ══════════════════ */
// To add a new level: push a new entry to this array.
// The game engine reads all behaviour from the active level config.
const LEVELS = [
  {
    id:            1,
    cols:          5,      // birds per row
    rows:          2,      // rows of birds
    formStartY:    0.12,   // formation top edge as fraction of screen height
    colGapMax:     54,     // max px between bird columns
    rowGap:        46,     // px between bird rows
    formSpeed:     0.55,   // horizontal formation drift (px/frame)
    stepDown:      14,     // px stepped down on wall-bounce
    wingFlapRate:  18,     // frames per wing-beat (smaller = faster flap)
    birdSize:      13,     // bird half-size in css-px (affects draw + collision)
    bonusScore:    150,    // awarded on level clear
  },
  // Future example (uncomment to add Level 2):
  // {
  //   id: 2, cols: 5, rows: 3,
  //   formStartY: 0.10, colGapMax: 48, rowGap: 40,
  //   formSpeed: 0.75, stepDown: 12, wingFlapRate: 14,
  //   birdSize: 12, bonusScore: 250,
  // },
];

/* ═══════════════════════ FACTORY ═════════════════════════════ */
function mkBirds(level, cssW, cssH) {
  const { cols, rows, formStartY, colGapMax, rowGap, birdSize } = level;
  const colGap = Math.min(colGapMax, (cssW - 60) / (cols - 1));
  const totalW = (cols - 1) * colGap;
  const startX = (cssW - totalW) / 2;
  const startY = cssH * formStartY + birdSize * 2;
  const birds  = [];
  let id = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      birds.push({
        id:      id++,
        col:     c,
        row:     r,
        x:       startX + c * colGap,
        baseY:   startY + r * rowGap,
        pattern: Math.floor(Math.random() * BIRD_PATTERNS.length),
        alive:   true,
      });
    }
  }
  return birds;
}

function mkSparks(cx, cy, n, col, speed = 1) {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const spd = (0.8 + Math.random() * 2.8) * speed;
    return {
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 0.4,
      life: 0.8 + Math.random() * 0.4,
      col, w: 0.6 + Math.random() * 1.0,
    };
  });
}

/* ═══════════════════════ DRAW HELPERS ════════════════════════ */

// Bird drawn front-on with animated wings.
// wingFrame 0 = wings up, 1 = wings down.
function drawBird(ctx, sz, wingFrame, dpr) {
  const r = sz * dpr;
  ctx.lineJoin = "round";
  ctx.lineCap  = "round";

  // body
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.48, r * 0.60, 0, 0, Math.PI * 2);
  ctx.stroke();

  // head
  ctx.beginPath();
  ctx.arc(0, -r * 0.72, r * 0.30, 0, Math.PI * 2);
  ctx.stroke();

  // beak (angled, aggressive V-shape)
  ctx.beginPath();
  ctx.moveTo(-r * 0.17, -r * 0.54);
  ctx.lineTo(0,          -r * 0.34);
  ctx.lineTo( r * 0.17, -r * 0.54);
  ctx.stroke();

  // eyes (small filled circles)
  ctx.beginPath();
  ctx.arc(-r * 0.12, -r * 0.76, r * 0.075, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc( r * 0.12, -r * 0.76, r * 0.075, 0, Math.PI * 2);
  ctx.fill();

  // wings – tip Y differs between frames to create flap motion
  const tipY = wingFrame === 0 ? -r * 0.85 : r * 0.65;
  const midX = wingFrame === 0 ?  r * 0.20 : r * 0.08;

  ctx.beginPath(); // left wing
  ctx.moveTo(-r * 0.47, r * 0.05);
  ctx.quadraticCurveTo(-r * 1.10, midX, -r * 1.55, tipY);
  ctx.stroke();

  ctx.beginPath(); // right wing
  ctx.moveTo( r * 0.47, r * 0.05);
  ctx.quadraticCurveTo( r * 1.10, midX,  r * 1.55, tipY);
  ctx.stroke();

  // tail feathers
  ctx.beginPath();
  ctx.moveTo(-r * 0.28, r * 0.60); ctx.lineTo(-r * 0.40, r * 1.05);
  ctx.moveTo(         0, r * 0.60); ctx.lineTo(         0, r * 1.08);
  ctx.moveTo( r * 0.28, r * 0.60); ctx.lineTo( r * 0.40, r * 1.05);
  ctx.stroke();
}

function drawBirdAt(ctx, bird, frame, level, dpr) {
  const wingFrame = Math.floor(frame / level.wingFlapRate) % 2;
  const y         = bird.baseY + BIRD_PATTERNS[bird.pattern](frame);
  ctx.save();
  ctx.translate(bird.x * dpr, y * dpr);
  ctx.shadowColor = C_MAIN;
  ctx.shadowBlur  = 6 * dpr;
  ctx.strokeStyle = C_MAIN;
  ctx.fillStyle   = C_MAIN;
  ctx.lineWidth   = 1.3 * dpr;
  drawBird(ctx, level.birdSize, wingFrame, dpr);
  ctx.restore();
}

function drawShip(ctx, x, y, dpr, tilt) {
  const s = P_R * dpr;
  ctx.save();
  ctx.translate(x * dpr, y * dpr);
  ctx.rotate(tilt * 0.12);
  ctx.shadowColor = C_MAIN;
  ctx.shadowBlur  = 8 * dpr;
  ctx.strokeStyle = C_MAIN;
  ctx.lineWidth   = 1.6 * dpr;
  ctx.lineJoin    = "round";
  ctx.beginPath();
  ctx.moveTo(0,      -s * 1.5);
  ctx.lineTo( s,      s);
  ctx.lineTo( 0,      s * 0.45);
  ctx.lineTo(-s,      s);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawBullet(ctx, b, dpr) {
  ctx.save();
  ctx.shadowColor = C_NEAR;
  ctx.shadowBlur  = 8 * dpr;
  ctx.strokeStyle = C_MAIN;
  ctx.lineWidth   = 2.2 * dpr;
  ctx.beginPath();
  ctx.moveTo(b.x * dpr, b.y * dpr);
  ctx.lineTo(b.x * dpr, (b.y - 9) * dpr);
  ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx, particles, dpr) {
  for (const p of particles) {
    ctx.globalAlpha = p.life * p.life;
    ctx.strokeStyle = p.col;
    ctx.lineWidth   = p.w * dpr;
    ctx.shadowColor = p.col;
    ctx.shadowBlur  = 5 * dpr;
    ctx.beginPath();
    ctx.moveTo(p.x * dpr, p.y * dpr);
    ctx.lineTo((p.x - p.vx * 3) * dpr, (p.y - p.vy * 3) * dpr);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

function drawStars(ctx, stars, dpr) {
  for (const s of stars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle   = C_NEAR;
    ctx.fillRect(s.x * dpr, s.y * dpr, s.sz * dpr, s.sz * dpr);
  }
  ctx.globalAlpha = 1;
}

function drawScanlines(ctx, W, H) {
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = C_SCAN;
    ctx.fillRect(0, y, W, 1);
  }
}

function drawHUD(ctx, { score, levelId, lives }, dpr, cssW, cssH) {
  const mono = "'Share Tech Mono','Courier New',monospace";
  ctx.shadowColor = C_MAIN;
  ctx.shadowBlur  = 6 * dpr;
  ctx.fillStyle   = C_MAIN;
  ctx.font        = `${14 * dpr}px ${mono}`;
  ctx.textAlign   = "left";
  ctx.fillText(String(score), 14 * dpr, 26 * dpr);

  ctx.font      = `${11 * dpr}px ${mono}`;
  ctx.textAlign = "right";
  ctx.fillText(`L${levelId}`, (cssW - 14) * dpr, 26 * dpr);

  ctx.shadowBlur = 0;

  // lives – mini ship icons along the bottom
  for (let i = 0; i < lives; i++) {
    const sx = (14 + i * 20) * dpr;
    const sy = (cssH - 20) * dpr;
    const sz = 7 * dpr;
    ctx.strokeStyle = C_MAIN;
    ctx.lineWidth   = 1.2 * dpr;
    ctx.lineJoin    = "round";
    ctx.beginPath();
    ctx.moveTo(sx,            sy - sz);
    ctx.lineTo(sx + sz * 0.8, sy + sz * 0.5);
    ctx.lineTo(sx,            sy + sz * 0.1);
    ctx.lineTo(sx - sz * 0.8, sy + sz * 0.5);
    ctx.closePath();
    ctx.stroke();
  }
}

/* ═══════════════════════ ICON ════════════════════════════════ */
function IconHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2"  y="2"  width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="2"  width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="2"  y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="10" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

/* ═══════════════════════ META ════════════════════════════════ */
export const meta = {
  path:        "/level9",
  symbol:      "∧",
  name:        "level9",
  description: "shoot the uccellacci before they reach you",
};

/* ═══════════════════════ COMPONENT ══════════════════════════ */
export default function Level9Game() {
  const cvs      = useRef(null);
  const raf      = useRef(null);
  const g        = useRef(null);
  const starsR   = useRef([]);
  const navigate = useNavigate();

  const [phase,     setPhase]     = useState("idle");
  const [score,     setScore]     = useState(0);
  const [best,      setBest]      = useState(0);
  const [levelIdx,  setLevelIdx]  = useState(0);
  const [won,       setWon]       = useState(false);

  // track best when a round ends
  useEffect(() => {
    if (phase === "done") setBest(b => Math.max(b, score));
  }, [phase, score]);

  /* ── star field ──────────────────────────────────── */
  useEffect(() => {
    const gen = () => {
      const c = cvs.current;
      const W = c ? c.offsetWidth  : 430;
      const H = c ? c.offsetHeight : 760;
      starsR.current = Array.from({ length: 70 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        sz: 0.5 + Math.random() * 1.2,
        a:  0.06 + Math.random() * 0.22,
      }));
    };
    gen();
    window.addEventListener("resize", gen);
    return () => window.removeEventListener("resize", gen);
  }, []);

  /* ── canvas resize ───────────────────────────────── */
  useEffect(() => {
    const resize = () => {
      const c = cvs.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width   = c.offsetWidth  * dpr;
      c.height  = c.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  /* ── render ──────────────────────────────────────── */
  const render = useCallback(() => {
    const c = cvs.current;
    const s = g.current;
    if (!c) return;
    const ctx  = c.getContext("2d");
    const dpr  = window.devicePixelRatio || 1;
    const W    = c.width;
    const H    = c.height;
    const cssW = c.offsetWidth;
    const cssH = c.offsetHeight;

    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, W, H);
    drawStars(ctx, starsR.current, dpr);
    drawScanlines(ctx, W, H);
    if (!s) return;

    const level = LEVELS[s.levelIdx];

    // particles
    s.particles = s.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= 0.022;
      return p.life > 0;
    });
    drawParticles(ctx, s.particles, dpr);

    // player bullets
    for (const b of s.bullets) drawBullet(ctx, b, dpr);

    // birds
    for (const bird of s.birds) {
      if (bird.alive) drawBirdAt(ctx, bird, s.frame, level, dpr);
    }

    // player ship (blinks while invincible)
    if (s.lives > 0) {
      const visible = s.invincible <= 0 || Math.floor(s.invincible / 5) % 2 === 0;
      if (visible) {
        const tilt = (s.tx - s.px) * 0.025;
        drawShip(ctx, s.px, cssH * 0.88, dpr, tilt);
      }
    }

    drawHUD(ctx, { score: s.score, levelId: level.id, lives: s.lives }, dpr, cssW, cssH);

    if (s.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${s.hitFlash * 0.18})`;
      ctx.fillRect(0, 0, W, H);
      s.hitFlash = Math.max(0, s.hitFlash - 0.07);
    }
  }, []);

  /* ── main loop ───────────────────────────────────── */
  const loop = useCallback(() => {
    const s = g.current;
    const c = cvs.current;
    if (!s || !s.on || !c) return;

    const cssW  = c.offsetWidth;
    const cssH  = c.offsetHeight;
    const shipY = cssH * 0.88;
    const level = LEVELS[s.levelIdx];

    s.frame++;

    // smooth ship follow cursor
    s.px += (s.tx - s.px) * 0.15;
    s.px  = Math.max(P_R, Math.min(cssW - P_R, s.px));

    // auto-fire
    s.nextShoot--;
    if (s.nextShoot <= 0 && s.bullets.length < 3) {
      s.bullets.push({ x: s.px, y: shipY - 16 });
      s.nextShoot = SHOOT_INT;
    }

    // move bullets
    s.bullets = s.bullets.filter(b => { b.y -= BULLET_SPD; return b.y > -10; });

    /* ── formation movement ──────────────────────── */
    const alive = s.birds.filter(b => b.alive);

    if (alive.length === 0) {
      // all birds killed → level clear
      s.on = false;
      s.score += level.bonusScore;
      setScore(s.score);
      setWon(true);
      setPhase("done");
      render();
      return;
    }

    // horizontal drift + wall-bounce → step down
    const minX = Math.min(...alive.map(b => b.x));
    const maxX = Math.max(...alive.map(b => b.x));

    if ((s.formDirX > 0 && maxX > cssW - 28) || (s.formDirX < 0 && minX < 28)) {
      s.formDirX *= -1;
      for (const b of s.birds) b.baseY += level.stepDown;
    } else {
      for (const b of s.birds) b.x += level.formSpeed * s.formDirX;
    }

    // if any bird descends past the danger line → game over
    const dangerY = shipY - 30;
    const tooLow  = alive.some(
      b => b.baseY + Math.abs(BIRD_PATTERNS[b.pattern](s.frame)) > dangerY
    );
    if (tooLow) {
      s.on    = false;
      s.lives = 0;
      s.particles.push(...mkSparks(s.px, shipY, 22, C_MAIN, 1.2));
      setScore(s.score);
      setWon(false);
      const deathLoop = () => {
        render();
        if (s.particles.length > 0) raf.current = requestAnimationFrame(deathLoop);
        else setPhase("done");
      };
      raf.current = requestAnimationFrame(deathLoop);
      return;
    }

    /* ── bullet × bird collision ─────────────────── */
    const deadBullets = new Set();
    for (let bi = 0; bi < s.bullets.length; bi++) {
      const bul = s.bullets[bi];
      for (const bird of s.birds) {
        if (!bird.alive || deadBullets.has(bi)) continue;
        const by = bird.baseY + BIRD_PATTERNS[bird.pattern](s.frame);
        if (Math.abs(bul.x - bird.x) < B_HW && Math.abs(bul.y - by) < B_HH) {
          bird.alive = false;
          deadBullets.add(bi);
          s.score += BIRD_PTS;
          s.particles.push(...mkSparks(bird.x, by, 7, C_MAIN));
          s.particles.push(...mkSparks(bird.x, by, 3, C_NEAR, 1.6));
        }
      }
    }
    s.bullets = s.bullets.filter((_, i) => !deadBullets.has(i));

    if (s.invincible > 0) s.invincible--;

    setScore(s.score);
    render();
    raf.current = requestAnimationFrame(loop);
  }, [render]);

  /* ── start / restart ─────────────────────────────── */
  const start = useCallback((lvlIdx = 0) => {
    cancelAnimationFrame(raf.current);
    const c = cvs.current;
    if (!c) return;
    const cssW = c.offsetWidth;
    const cssH = c.offsetHeight;
    g.current = {
      on:        true,
      frame:     0,
      score:     0,
      levelIdx:  lvlIdx,
      lives:     LIVES_INIT,
      px:        cssW / 2,
      tx:        cssW / 2,
      bullets:   [],
      birds:     mkBirds(LEVELS[lvlIdx], cssW, cssH),
      formDirX:  1,
      particles: [],
      nextShoot: SHOOT_INT,
      hitFlash:  0,
      invincible: 0,
    };
    setLevelIdx(lvlIdx);
    setWon(false);
    setScore(0);
    setPhase("playing");
    raf.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => {
    if (phase !== "playing") render();
  }, [phase, render]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ── pointer / touch tracking ────────────────────── */
  const track = useCallback(e => {
    if (!g.current?.on) return;
    const c    = cvs.current;
    const rect = c.getBoundingClientRect();
    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
    g.current.tx = cx - rect.left;
  }, []);

  const handleTouchMove = useCallback(e => {
    e.preventDefault();
    track(e);
  }, [track]);

  /* ═══════════════════════ UI ════════════════════════════════ */
  const mono = "'Share Tech Mono','Courier New',monospace";

  const BtnStyle = {
    background:   "transparent",
    border:       "1px solid rgba(255,255,255,0.22)",
    color:        "#fff",
    fontFamily:   mono,
    fontSize:     11,
    letterSpacing: 5,
    padding:      "14px 36px",
    cursor:       "pointer",
    textTransform: "uppercase",
  };

  const HubBtn = (
    <button
      aria-label="back to hub"
      onClick={() => navigate("/")}
      onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
      onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.38)"; }}
      style={{
        position: "absolute", top: 14, right: 12, zIndex: 20,
        background: "transparent", border: "none",
        color: "rgba(255,255,255,0.38)",
        cursor: "pointer", padding: 6, lineHeight: 0,
        transition: "color 0.2s",
      }}
    >
      <IconHub />
    </button>
  );

  const Overlay = ({ children }) => (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.5s ease",
      zIndex: 10,
    }}>
      {children}
    </div>
  );

  const levelId = LEVELS[levelIdx]?.id ?? 1;

  return (
    <div style={{
      width: "100vw", height: "100dvh",
      background: C_BG,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        position: "relative",
        width: 430, height: 760,
        maxWidth: "100%", maxHeight: "100%",
        overflow: "hidden",
        userSelect: "none",
        fontFamily: mono,
        touchAction: "none",
        outline: "1px solid rgba(255,255,255,0.07)",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
          * { -webkit-tap-highlight-color: transparent; }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* ── CANVAS ── */}
        <canvas
          ref={cvs}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          onMouseMove={track}
          onTouchStart={track}
          onTouchMove={handleTouchMove}
        />

        {HubBtn}

        {/* ── IDLE ── */}
        {phase === "idle" && (
          <Overlay>
            <div style={{ color: "#fff", fontSize: 10, letterSpacing: 6, marginBottom: 28, opacity: 0.28, textTransform: "uppercase" }}>
              level9
            </div>
            <div style={{ color: "#fff", fontSize: 48, fontWeight: 300, lineHeight: 1, opacity: 0.85 }}>∧</div>
            <div style={{ color: "#fff", fontSize: 9, letterSpacing: 2, marginTop: 24, opacity: 0.22, textAlign: "center", lineHeight: 1.9 }}>
              shoot the uccellacci<br />before they reach you
            </div>
            {best > 0 && (
              <div style={{ color: "#fff", fontSize: 10, letterSpacing: 3, marginTop: 32, opacity: 0.18 }}>
                best {best}
              </div>
            )}
            <button
              style={{ ...BtnStyle, marginTop: 48 }}
              onMouseEnter={e => { e.target.style.borderColor = "rgba(255,255,255,0.6)"; }}
              onMouseLeave={e => { e.target.style.borderColor = "rgba(255,255,255,0.22)"; }}
              onClick={() => start(0)}
            >
              start
            </button>
          </Overlay>
        )}

        {/* ── DONE ── */}
        {phase === "done" && (
          <Overlay>
            <div style={{ color: "#fff", fontSize: 10, letterSpacing: 6, opacity: 0.28, textTransform: "uppercase", marginBottom: 16 }}>
              {won ? `level ${levelId} clear` : "game over"}
            </div>
            <div style={{ color: "#fff", fontSize: 80, fontWeight: 300, letterSpacing: -3, lineHeight: 1 }}>
              {score}
            </div>
            {won
              ? score > 0 && score >= best
                ? <div style={{ color: "#fff", fontSize: 10, letterSpacing: 5, opacity: 0.32, marginTop: 12, textTransform: "uppercase" }}>new best</div>
                : <div style={{ color: "#fff", fontSize: 10, letterSpacing: 3, opacity: 0.2,  marginTop: 12 }}>best {best}</div>
              : best > 0
                ? <div style={{ color: "#fff", fontSize: 10, letterSpacing: 3, opacity: 0.2,  marginTop: 12 }}>best {best}</div>
                : null
            }
            {won && (
              <div style={{ color: "#fff", fontSize: 9, letterSpacing: 2, opacity: 0.16, marginTop: 28, textAlign: "center", lineHeight: 1.9 }}>
                more levels coming soon
              </div>
            )}
            <button
              style={{ ...BtnStyle, marginTop: 48 }}
              onMouseEnter={e => { e.target.style.borderColor = "rgba(255,255,255,0.6)"; }}
              onMouseLeave={e => { e.target.style.borderColor = "rgba(255,255,255,0.22)"; }}
              onClick={() => start(0)}
            >
              again
            </button>
          </Overlay>
        )}
      </div>
    </div>
  );
}
