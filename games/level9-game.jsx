import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════ PALETTE ════════════════════ */
const C_BG    = "#0a0a0a";
const C_MAIN  = "rgba(255,255,255,0.88)";
const C_NEAR  = "rgba(255,255,255,1)";
const C_SCAN  = "rgba(255,255,255,0.018)";
const C_EBUL   = "rgba(255,140,140,0.9)";
const C_PHAZOR = "rgba(180,120,255,0.95)";

/* ═══════════════════════ CONFIG ═════════════════════ */
const P_R         = 13;    // player half-size (collision radius)
const LIVES_INIT  = 3;
const COLS        = 9;
const ROWS        = 4;
const E_HW        = 14;    // enemy half-width  (collision)
const E_HH        = 12;    // enemy half-height (collision)
const COL_GAP     = 40;    // enemy column spacing (center-to-center)
const ROW_GAP     = 34;    // enemy row spacing
const FORM_TOP    = 56;    // y of first row start
const STEP_DOWN   = 18;    // pixels stepped down on wall bounce
const BULLET_SPD  = 8;
const E_BULLET_SPD = 3.2;
const SHOOT_INT   = 20;    // frames between player auto-shots (max 3 bullets)
const ROW_PTS     = [30, 20, 15, 10]; // score per enemy by row
const MAX_WAVES         = 42; // total waves (matches the original game's title)
const MAX_WAVE_Y_OFFSET = 6;  // cap on extra starting-row depth per wave
const PHAZOR_SCORE_INTERVAL = 7500; // earn +1 phazor every N points
const MAX_PHAZORS           = 5;    // phazor cap

/* ═══════════════════════ HELPERS ════════════════════ */
function mkEnemies(wave, W) {
  const totalW = (COLS - 1) * COL_GAP;
  const startX = (W - totalW) / 2;
  const enemies = [];
  let id = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      enemies.push({
        id: id++,
        col: c, row: r,
        x: startX + c * COL_GAP,
        y: FORM_TOP + r * ROW_GAP + Math.min(wave - 1, MAX_WAVE_Y_OFFSET) * 8,
        type: r === 0 ? 0 : r <= 2 ? 1 : 2,
        alive: true,
      });
    }
  }
  return enemies;
}

function mkSparks(cx, cy, n, col, speed = 1) {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const spd = (1.0 + Math.random() * 3.0) * speed;
    return {
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 0.5,
      life: 0.8 + Math.random() * 0.4,
      col, w: 0.6 + Math.random() * 0.9,
    };
  });
}

/* ═══════════════════════ DRAW HELPERS ══════════════ */
function drawShip(ctx, x, y, dpr, tilt, alpha) {
  const s = P_R * dpr;
  ctx.save();
  ctx.translate(x * dpr, y * dpr);
  ctx.rotate(tilt * 0.1);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = C_MAIN;
  ctx.shadowBlur  = 8 * dpr;
  ctx.strokeStyle = C_MAIN;
  ctx.lineWidth   = 1.6 * dpr;
  ctx.lineJoin    = "round";
  ctx.beginPath();
  ctx.moveTo(0,    -s * 1.5);
  ctx.lineTo( s,    s);
  ctx.lineTo( 0,    s * 0.45);
  ctx.lineTo(-s,    s);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// enemy type 0 – saucer (top row)
function drawSaucer(ctx, sz, anim, dpr) {
  const r = sz * dpr;
  ctx.beginPath();
  ctx.arc(0, r * 0.15, r * 0.85, Math.PI, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, r * 0.15, r * 0.45, Math.PI, 0);
  ctx.stroke();
  // legs
  const offY = r * 0.6;
  const legX = anim === 0 ? r * 0.5 : r * 0.7;
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, r * 0.15); ctx.lineTo(-legX, offY);
  ctx.moveTo( 0,       r * 0.15); ctx.lineTo( 0,    offY * (anim === 0 ? 0.9 : 1.1));
  ctx.moveTo( r * 0.9, r * 0.15); ctx.lineTo( legX, offY);
  ctx.stroke();
}

// enemy type 1 – crab (middle rows)
function drawCrab(ctx, sz, anim, dpr) {
  const r = sz * dpr;
  const w = r * 0.95;
  const h = r * 0.65;
  ctx.strokeRect(-w, -h * 0.5, w * 2, h);
  ctx.beginPath();
  ctx.arc(-w * 0.38, 0, r * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc( w * 0.38, 0, r * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  const claw = anim === 0 ? r * 0.45 : r * 0.82;
  ctx.beginPath();
  ctx.moveTo(-w, 0); ctx.lineTo(-w - claw, -r * 0.5);
  ctx.moveTo(-w, 0); ctx.lineTo(-w - claw,  r * 0.5);
  ctx.moveTo( w, 0); ctx.lineTo( w + claw, -r * 0.5);
  ctx.moveTo( w, 0); ctx.lineTo( w + claw,  r * 0.5);
  ctx.stroke();
}

// enemy type 2 – squid (bottom row)
function drawSquid(ctx, sz, anim, dpr) {
  const r = sz * dpr;
  ctx.beginPath();
  ctx.moveTo( 0,       -r);
  ctx.lineTo( r,        0);
  ctx.lineTo( 0,        r * 0.55);
  ctx.lineTo(-r,        0);
  ctx.closePath();
  ctx.stroke();
  const tLen = anim === 0 ? r * 1.1 : r * 0.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.42, r * 0.55);
    ctx.lineTo(i * r * (anim === 0 ? 0.55 : 0.32), r * 0.55 + tLen);
    ctx.stroke();
  }
}

function drawEnemy(ctx, e, dpr, frame) {
  const anim = Math.floor(frame / 20) % 2;
  const sz   = 11;
  ctx.save();
  ctx.translate(e.x * dpr, e.y * dpr);
  ctx.shadowColor = C_MAIN;
  ctx.shadowBlur  = 6 * dpr;
  ctx.strokeStyle = C_MAIN;
  ctx.lineWidth   = 1.4 * dpr;
  ctx.lineJoin    = "round";
  if      (e.type === 0) drawSaucer(ctx, sz, anim, dpr);
  else if (e.type === 1) drawCrab  (ctx, sz, anim, dpr);
  else                   drawSquid (ctx, sz, anim, dpr);
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

function drawEnemyBullet(ctx, b, dpr) {
  ctx.save();
  ctx.shadowColor = C_EBUL;
  ctx.shadowBlur  = 7 * dpr;
  ctx.strokeStyle = C_EBUL;
  ctx.lineWidth   = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(b.x * dpr, b.y * dpr);
  ctx.lineTo(b.x * dpr, (b.y + 9) * dpr);
  ctx.stroke();
  ctx.restore();
}

function drawPhazorBeam(ctx, beam, dpr) {
  if (!beam) return;
  const alpha = Math.max(0, 1 - beam.t / 12);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = C_PHAZOR;
  ctx.shadowBlur  = 22 * dpr;
  ctx.strokeStyle = C_PHAZOR;
  ctx.lineWidth   = 2.5 * dpr;
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";
  // two overlapping jagged paths give a richer lightning look
  for (let pass = 0; pass < 2; pass++) {
    const segs = 7;
    ctx.beginPath();
    ctx.moveTo(beam.x1 * dpr, beam.y1 * dpr);
    for (let i = 1; i < segs; i++) {
      const t  = i / segs;
      const jx = beam.x1 + (beam.x2 - beam.x1) * t + (Math.random() - 0.5) * 30;
      const jy = beam.y1 + (beam.y2 - beam.y1) * t + (Math.random() - 0.5) * 15;
      ctx.lineTo(jx * dpr, jy * dpr);
    }
    ctx.lineTo(beam.x2 * dpr, beam.y2 * dpr);
    ctx.stroke();
  }
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
    ctx.fillStyle   = C_MAIN;
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

function drawHUD(ctx, { score, wave, lives, phazors }, dpr, cssW, cssH) {
  const mono = "'Share Tech Mono', monospace";
  ctx.shadowColor = C_MAIN;
  ctx.shadowBlur  = 6 * dpr;
  ctx.fillStyle   = C_MAIN;
  ctx.font        = `${14 * dpr}px ${mono}`;
  ctx.textAlign   = "left";
  ctx.fillText(String(score), 14 * dpr, 26 * dpr);

  ctx.font      = `${11 * dpr}px ${mono}`;
  ctx.textAlign = "right";
  ctx.fillText(`W${wave}`, (cssW - 14) * dpr, 26 * dpr);

  ctx.shadowBlur = 0;

  // lives – mini ship icons
  const baseX = 14;
  const baseY = cssH - 20;
  for (let i = 0; i < lives; i++) {
    const sx = (baseX + i * 20) * dpr;
    const sy = baseY * dpr;
    const sz = 7 * dpr;
    ctx.strokeStyle = C_MAIN;
    ctx.lineWidth   = 1.2 * dpr;
    ctx.lineJoin    = "round";
    ctx.beginPath();
    ctx.moveTo(sx,          sy - sz);
    ctx.lineTo(sx + sz * 0.8, sy + sz * 0.5);
    ctx.lineTo(sx,          sy + sz * 0.1);
    ctx.lineTo(sx - sz * 0.8, sy + sz * 0.5);
    ctx.closePath();
    ctx.stroke();
  }

  // phazors – lightning bolt icons (bottom right, bottom row)
  for (let i = 0; i < phazors; i++) {
    const lx = (cssW - 14 - i * 16) * dpr;
    const ly = (cssH - 20) * dpr;
    const sz = 6 * dpr;
    ctx.shadowColor = C_PHAZOR;
    ctx.shadowBlur  = 6 * dpr;
    ctx.strokeStyle = C_PHAZOR;
    ctx.lineWidth   = 1.4 * dpr;
    ctx.lineJoin    = "round";
    ctx.lineCap     = "round";
    // lightning bolt: top-right → middle-left → middle-right → bottom-left
    ctx.beginPath();
    ctx.moveTo(lx + sz * 0.2, ly - sz);
    ctx.lineTo(lx - sz * 0.3, ly + sz * 0.1);
    ctx.lineTo(lx + sz * 0.2, ly + sz * 0.1);
    ctx.lineTo(lx - sz * 0.2, ly + sz);
    ctx.stroke();
  }
}

/* ═══════════════════════ COMPONENT ════════════════ */
export const meta = {
  path:        "/level9",
  symbol:      "9",
  name:        "level9",
  description: "defend against the alien fleet",
};

export default function Level9Game() {
  const cvs    = useRef(null);
  const raf    = useRef(null);
  const g      = useRef(null);
  const starsR = useRef([]);
  const touchStart = useRef(null);

  const [phase, setPhase] = useState("idle");
  const [score, setScore] = useState(0);
  const [best,  setBest]  = useState(0);
  const [won,   setWon]   = useState(false);

  // ── star field ──────────────────────────────────────
  useEffect(() => {
    const gen = () => {
      const c = cvs.current;
      const W = c ? c.offsetWidth  : 430;
      const H = c ? c.offsetHeight : 760;
      starsR.current = Array.from({ length: 80 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        sz: 0.5 + Math.random() * 1.2,
        a:  0.07 + Math.random() * 0.25,
      }));
    };
    gen();
    window.addEventListener("resize", gen);
    return () => window.removeEventListener("resize", gen);
  }, []);

  // ── canvas resize ────────────────────────────────────
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

  /* ── render ─────────────────────────────────────────── */
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

    // particles
    s.particles = s.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.02;
      return p.life > 0;
    });
    drawParticles(ctx, s.particles, dpr);

    // phazor beam
    if (s.phazorBeam) {
      drawPhazorBeam(ctx, s.phazorBeam, dpr);
      s.phazorBeam.t++;
      if (s.phazorBeam.t > 14) s.phazorBeam = null;
    }

    // player bullets
    for (const b of s.bullets)       drawBullet(ctx, b, dpr);
    // enemy bullets
    for (const b of s.enemyBullets)  drawEnemyBullet(ctx, b, dpr);

    // enemies
    for (const e of s.enemies) {
      if (e.alive) drawEnemy(ctx, e, dpr, s.frame);
    }

    // player ship (blink when invincible)
    if (s.lives > 0) {
      const visible = s.invincible <= 0 || Math.floor(s.invincible / 5) % 2 === 0;
      if (visible) {
        const tilt  = (s.tx - s.px) * 0.03;
        drawShip(ctx, s.px, cssH * 0.88, dpr, tilt, 1);
      }
    }

    // HUD
    drawHUD(ctx, { score: s.score, wave: s.wave, lives: s.lives, phazors: s.phazors }, dpr, cssW, cssH);

    // red screen flash on hit
    if (s.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${s.hitFlash * 0.16})`;
      ctx.fillRect(0, 0, W, H);
      s.hitFlash = Math.max(0, s.hitFlash - 0.07);
    }
  }, []);

  /* ── fire phazor ────────────────────────────────────── */
  const firePhazor = useCallback(() => {
    const s = g.current;
    const c = cvs.current;
    if (!s || !s.on || s.phazors <= 0) return;
    const alive = s.enemies.filter(e => e.alive);
    if (alive.length === 0) return;
    s.phazors--;
    const target = alive[Math.floor(Math.random() * alive.length)];
    target.alive = false;
    s.score += ROW_PTS[target.row] * 2;
    const cssH = c ? c.offsetHeight : 760;
    const shipY = cssH * 0.88;
    s.phazorBeam = { x1: s.px, y1: shipY, x2: target.x, y2: target.y, t: 0 };
    s.particles.push(...mkSparks(target.x, target.y, 12, C_PHAZOR, 1.5));
    s.particles.push(...mkSparks(target.x, target.y, 5,  C_NEAR,   2.0));
  }, []);

  /* ── main loop ──────────────────────────────────────── */
  const loop = useCallback(() => {
    const s = g.current;
    const c = cvs.current;
    if (!s || !s.on || !c) return;

    const cssW  = c.offsetWidth;
    const cssH  = c.offsetHeight;
    const shipY = cssH * 0.88;

    s.frame++;

    // smooth ship follow
    s.px += (s.tx - s.px) * 0.15;
    s.px  = Math.max(P_R, Math.min(cssW - P_R, s.px));

    // auto-fire bullets
    s.nextShoot--;
    if (s.nextShoot <= 0 && s.bullets.length < 3) {
      s.bullets.push({ x: s.px, y: shipY - 16 });
      s.nextShoot = SHOOT_INT;
    }

    // move player bullets
    s.bullets = s.bullets.filter(b => { b.y -= BULLET_SPD; return b.y > -10; });

    // ── enemy formation ──────────────────────────────────
    const alive = s.enemies.filter(e => e.alive);

    if (alive.length === 0) {
      // wave cleared
      s.wave++;
      s.score += 200 + s.wave * 20;
      s.phazors = Math.min(s.phazors + 1, MAX_PHAZORS); // earn phazor on wave completion
      if (s.wave > MAX_WAVES) {
        // all 42 waves cleared – victory!
        s.on = false;
        setScore(s.score);
        setBest(b => Math.max(b, s.score));
        setWon(true);
        setPhase("done");
        render();
        return;
      }
      s.enemies      = mkEnemies(s.wave, cssW);
      s.formDirX     = 1;
      s.formSpeed    = 0.9 + Math.min(s.wave * 0.10, 1.5);
      s.bullets      = [];
      s.enemyBullets = [];
      s.nextShoot    = SHOOT_INT;
      setScore(s.score);
      render();
      raf.current = requestAnimationFrame(loop);
      return;
    }

    // formation speed increases as enemies die
    const remaining = alive.length;
    const totalEnemies = ROWS * COLS;
    const speedMult = 1 + ((totalEnemies - remaining) / totalEnemies) * 1.8;
    const speed = s.formSpeed * speedMult;

    const minX = Math.min(...alive.map(e => e.x));
    const maxX = Math.max(...alive.map(e => e.x));

    const hitRight = s.formDirX > 0 && maxX + speed > cssW - 20;
    const hitLeft  = s.formDirX < 0 && minX - speed < 20;

    if (hitRight || hitLeft) {
      // step down and reverse
      s.formDirX *= -1;
      for (const e of s.enemies) e.y += STEP_DOWN;

      const maxY = Math.max(...alive.map(e => e.y));
      if (maxY > shipY - 34) {
        // enemies reached player line → game over
        s.on = false;
        s.lives = 0;
        s.particles.push(...mkSparks(s.px, shipY, 24, C_MAIN, 1.2));
        setScore(s.score);
        setBest(b => Math.max(b, s.score));
        const deathLoop = () => {
          render();
          if (s.particles.length > 0) raf.current = requestAnimationFrame(deathLoop);
          else setPhase("done");
        };
        raf.current = requestAnimationFrame(deathLoop);
        return;
      }
    } else {
      for (const e of s.enemies) e.x += speed * s.formDirX;
    }

    // ── enemy shooting ───────────────────────────────────
    const shootInterval = Math.max(45, 180 - s.wave * 10);
    if (s.frame % shootInterval === 0) {
      // pick bottom-most alive enemy per column, then choose one randomly
      const byCol = {};
      for (const e of alive) {
        if (!byCol[e.col] || e.row > byCol[e.col].row) byCol[e.col] = e;
      }
      const shooters = Object.values(byCol);
      const shooter  = shooters[Math.floor(Math.random() * shooters.length)];
      if (shooter) s.enemyBullets.push({ x: shooter.x, y: shooter.y + E_HH + 2 });
    }

    // move enemy bullets
    s.enemyBullets = s.enemyBullets.filter(b => { b.y += E_BULLET_SPD; return b.y < cssH + 10; });

    // ── bullet × enemy collision ─────────────────────────
    const deadBullets = new Set();
    for (let bi = 0; bi < s.bullets.length; bi++) {
      const b = s.bullets[bi];
      for (const e of s.enemies) {
        if (!e.alive || deadBullets.has(bi)) continue;
        if (Math.abs(b.x - e.x) < E_HW && Math.abs(b.y - e.y) < E_HH + 4) {
          e.alive = false;
          deadBullets.add(bi);
          s.score += ROW_PTS[e.row];
          s.particles.push(...mkSparks(e.x, e.y, 6, C_MAIN));
        }
      }
    }
    s.bullets = s.bullets.filter((_, i) => !deadBullets.has(i));

    // ── enemy bullet × player collision ──────────────────
    if (s.invincible <= 0) {
      for (let bi = s.enemyBullets.length - 1; bi >= 0; bi--) {
        const b = s.enemyBullets[bi];
        if (Math.abs(b.x - s.px) < P_R + 4 && Math.abs(b.y - shipY) < P_R + 8) {
          s.enemyBullets.splice(bi, 1);
          s.lives--;
          s.hitFlash   = 1;
          s.invincible = 120;
          s.particles.push(...mkSparks(s.px, shipY, 14, C_MAIN, 0.9));

          if (s.lives <= 0) {
            s.on = false;
            setScore(s.score);
            setBest(prev => Math.max(prev, s.score));
            const deathLoop = () => {
              render();
              if (s.particles.length > 0) raf.current = requestAnimationFrame(deathLoop);
              else setPhase("done");
            };
            raf.current = requestAnimationFrame(deathLoop);
            return;
          }
          break;
        }
      }
    } else {
      s.invincible--;
    }

    // award phazor every PHAZOR_SCORE_INTERVAL points
    while (s.score >= s.phazorMilestone) {
      s.phazors = Math.min(s.phazors + 1, MAX_PHAZORS);
      s.phazorMilestone += PHAZOR_SCORE_INTERVAL;
    }

    setScore(s.score);
    render();
    raf.current = requestAnimationFrame(loop);
  }, [render]);

  /* ── start ──────────────────────────────────────────── */
  const start = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const c = cvs.current;
    if (!c) return;
    const cssW = c.offsetWidth;
    g.current = {
      on: true, frame: 0, score: 0, wave: 1,
      lives: LIVES_INIT,
      phazors: 1, phazorMilestone: PHAZOR_SCORE_INTERVAL, phazorBeam: null,
      px: cssW / 2, tx: cssW / 2,
      bullets: [], enemyBullets: [],
      enemies:   mkEnemies(1, cssW),
      formDirX:  1,
      formSpeed: 0.9,
      particles: [],
      nextShoot: SHOOT_INT,
      hitFlash:  0,
      invincible: 0,
    };
    setPhase("playing");
    setScore(0);
    setWon(false);
    raf.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => {
    if (phase !== "playing") render();
  }, [phase, render]);

  // ── pointer / touch tracking ─────────────────────────
  const track = useCallback(e => {
    if (!g.current?.on) return;
    const c    = cvs.current;
    const rect = c.getBoundingClientRect();
    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
    g.current.tx = cx - rect.left;
  }, []);

  const handleTouchStart = useCallback(e => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    track(e);
  }, [track]);

  const handleTouchMove = useCallback(e => {
    e.preventDefault();
    track(e);
  }, [track]);

  const handleTouchEnd = useCallback(e => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      firePhazor();
    }
  }, [firePhazor]);

  // ── keyboard ─────────────────────────────────────────
  useEffect(() => {
    const handle = e => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        firePhazor();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [firePhazor]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ═══════════════════════ UI ════════════════════════ */
  const mono = "'Share Tech Mono','Courier New',monospace";

  const Overlay = ({ children }) => (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.55s ease", fontFamily: mono,
    }}>{children}</div>
  );

  const Label = ({ children, style }) => (
    <div style={{
      color: C_MAIN, fontSize: 11, letterSpacing: 5,
      opacity: 0.5, textTransform: "uppercase", ...style,
    }}>{children}</div>
  );

  const Btn = ({ onClick, children }) => (
    <button
      style={{
        marginTop: 52, background: "transparent",
        border: `1px solid rgba(255,255,255,0.27)`, color: C_MAIN,
        fontFamily: mono, fontSize: 11, letterSpacing: 5,
        padding: "14px 36px", cursor: "pointer",
        textTransform: "uppercase", textShadow: `0 0 8px ${C_MAIN}`,
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C_MAIN; e.currentTarget.style.boxShadow = `0 0 18px ${C_MAIN}44`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.27)"; e.currentTarget.style.boxShadow = "none"; }}
      onClick={onClick}
    >{children}</button>
  );

  return (
    <div style={{
      width: "100vw", height: "100dvh", background: C_BG,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        position: "relative", width: 430, height: 760,
        maxWidth: "100%", maxHeight: "100%",
        overflow: "hidden", userSelect: "none", touchAction: "none",
        outline: "1px solid rgba(255,255,255,0.07)",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
          @keyframes fadeIn {
            from { opacity:0; transform:translateY(10px); }
            to   { opacity:1; transform:translateY(0); }
          }
          @keyframes flicker {
            0%,100%{opacity:1} 92%{opacity:.95} 94%{opacity:.78} 96%{opacity:.97}
          }
        `}</style>

        <canvas
          ref={cvs}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", animation: "flicker 7s infinite" }}
          onMouseMove={track}
          onClick={() => { if (g.current?.on) firePhazor(); }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* IDLE */}
        {phase === "idle" && (
          <Overlay>
            <Label style={{ fontSize: 10, letterSpacing: 8, marginBottom: 18 }}>— 42 waves —</Label>
            <div style={{
              color: C_MAIN, fontSize: 36, letterSpacing: 9, lineHeight: 1,
              textShadow: `0 0 28px ${C_MAIN}`, fontFamily: mono, marginBottom: 8,
            }}>LEVEL9</div>
            <Label style={{ fontSize: 10, marginBottom: 40 }}>alien fleet incoming</Label>

            <div style={{ display: "flex", gap: 24, marginTop: 4 }}>
              {[
                ["MOVE",      "cursor · touch drag"],
                ["CANNON",    "auto-fire · unlimited"],
                ["⚡ PHAZOR",  "space · tap · random kill"],
              ].map(([k, v]) => (
                <div key={k} style={{ textAlign: "center" }}>
                  <div style={{ color: C_MAIN, fontSize: 9, letterSpacing: 3, opacity: 0.55 }}>{k}</div>
                  <div style={{ color: C_MAIN, fontSize: 9, letterSpacing: 1, opacity: 0.2, marginTop: 3 }}>{v}</div>
                </div>
              ))}
            </div>

            {best > 0 && (
              <Label style={{ marginTop: 34, fontSize: 10, letterSpacing: 4, opacity: 0.22 }}>BEST &nbsp; {best}</Label>
            )}
            <Btn onClick={start}>launch</Btn>
          </Overlay>
        )}

        {/* DONE */}
        {phase === "done" && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            fontFamily: mono, background: C_BG,
            animation: "fadeIn 0.5s ease",
          }}>
            <div style={{ width: 48, height: 1, background: C_MAIN, opacity: 0.4, marginBottom: 28 }} />
            <div style={{ color: C_MAIN, fontSize: 11, letterSpacing: 6, textTransform: "uppercase", opacity: 0.55, marginBottom: 18 }}>
              {won ? "sector cleared" : "game over"}
            </div>
            <div style={{
              color: C_MAIN, fontSize: 80, fontWeight: 400, letterSpacing: -2, lineHeight: 1,
              textShadow: `0 0 40px ${C_MAIN}88`,
            }}>{score}</div>
            <div style={{ color: C_MAIN, fontSize: 11, letterSpacing: 4, opacity: 0.3, marginTop: 14 }}>
              {score > 0 && score >= best ? "new best" : `best ${best}`}
            </div>
            <Btn onClick={start}>again</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
