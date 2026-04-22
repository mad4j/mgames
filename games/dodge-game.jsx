import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { HubButton, SoundToggleButton } from "../src/game-controls.jsx";

/* ═══════════════════════ PALETTE ═══════════════════ */
const C_BG   = "var(--mg-color-background)";
const C_MAIN = "var(--mg-color-text-emphasis)";
const C_NEAR = "rgba(255,255,255,1)";
const C_BOMB = "var(--mg-color-text-strong)";
const C_SCAN = "rgba(255,255,255,0.018)";

/* ═══════════════════════ CONFIG ════════════════════ */
const P_R          = 14;
const SPD_INIT     = 1.8;
const SPD_RAMP     = 0.0012;
const GRACE_F      = 70;
const SPAWN_INIT   = 90;
const SPAWN_MIN    = 22;
const NEAR_MISS_R  = 32;
const NEAR_PTS     = 15;
const NEAR_CD      = 18;
const BOMB_SPAWN_F = 320;   // frames between bonus spawns
const BOMB_R       = 130;   // chain-explosion radius
const BOMB_PTS     = 120;   // bonus pts per asteroid destroyed

/* ═══════════════════════ FACTORIES ═════════════════ */
function mkAsteroidPts(sides, r) {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    const w = r * (0.68 + Math.random() * 0.42);
    return [Math.cos(a) * w, Math.sin(a) * w];
  });
}
function mkAsteroid(id, W, speed) {
  const r = 24 + Math.random() * 46;
  return {
    id, r,
    pts:   mkAsteroidPts(8 + Math.floor(Math.random() * 5), r),
    x:     r + 6 + Math.random() * (W - 2 * r - 12),
    y:     -r - 10,
    rot:   Math.random() * Math.PI * 2,
    rotV:  (Math.random() - 0.5) * 0.028,
    v:     speed * (0.60 + Math.random() * 0.80),
    drift: (Math.random() - 0.5) * 0.6,
  };
}
function mkBonus(id, W) {
  return {
    id, r: 10,
    x: 20 + Math.random() * (W - 40),
    y: -20,
    v: 1.4 + Math.random() * 0.8,
    rot: 0, rotV: 0.04,
    pulse: 0,
  };
}
function mkSparks(cx, cy, n, col, speed = 1) {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const spd = (1.2 + Math.random() * 3.5) * speed;
    return {
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 0.5,
      life: 0.85 + Math.random() * 0.4,
      col, w: 0.7 + Math.random() * 0.8,
    };
  });
}

/* ═══════════════════════ DRAW HELPERS ══════════════ */
function drawShip(ctx, x, y, dpr, tilt) {
  const s = P_R * dpr;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt * 0.18);
  ctx.shadowColor = "rgba(255,255,255,0.3)";
  ctx.shadowBlur  = 6 * dpr;
  ctx.strokeStyle = C_MAIN;
  ctx.lineWidth   = 1.6 * dpr;
  ctx.lineJoin    = "round";
  ctx.beginPath();
  ctx.moveTo(0,        -s * 1.6);
  ctx.lineTo( s * 1.0,  s * 1.0);
  ctx.lineTo(-s * 1.0,  s * 1.0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawAsteroid(ctx, a, dpr, nearFrac) {
  ctx.save();
  ctx.translate(a.x * dpr, a.y * dpr);
  ctx.rotate(a.rot);
  ctx.shadowColor = nearFrac > 0 ? C_NEAR : C_MAIN;
  ctx.shadowBlur  = (6 + nearFrac * 18) * dpr;
  ctx.strokeStyle = nearFrac > 0
    ? `rgba(255,255,255,1)`
    : "rgba(255,255,255,0.72)";
  ctx.lineWidth  = (1.4 + nearFrac) * dpr;
  ctx.lineJoin   = "round";
  ctx.beginPath();
  ctx.moveTo(a.pts[0][0] * dpr, a.pts[0][1] * dpr);
  for (let i = 1; i < a.pts.length; i++)
    ctx.lineTo(a.pts[i][0] * dpr, a.pts[i][1] * dpr);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawBonus(ctx, b, dpr, frame) {
  const r   = b.r * dpr;
  const t   = frame * 0.07;
  const glow = 8 + Math.sin(t) * 5;
  ctx.save();
  ctx.translate(b.x * dpr, b.y * dpr);
  ctx.rotate(b.rot);
  ctx.shadowColor = C_BOMB;
  ctx.shadowBlur  = glow * dpr;
  ctx.strokeStyle = C_BOMB;
  ctx.lineWidth   = 1.5 * dpr;
  // diamond ◆
  ctx.beginPath();
  ctx.moveTo(0,  -r * 1.5);
  ctx.lineTo( r,  0);
  ctx.lineTo(0,   r * 1.5);
  ctx.lineTo(-r,  0);
  ctx.closePath();
  ctx.stroke();
  // inner cross
  ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 1.5);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.85); ctx.lineTo(0,  r * 0.85);
  ctx.moveTo(-r * 0.85, 0); ctx.lineTo(r * 0.85, 0);
  ctx.strokeStyle = C_BOMB;
  ctx.lineWidth   = 0.8 * dpr;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBombRing(ctx, ring, dpr) {
  const prog = Math.min(ring.t / ring.dur, 1);
  const r    = prog * ring.maxR * dpr;
  const op   = Math.pow(1 - prog, 1.4) * 0.92;
  if (op <= 0) return;
  ctx.beginPath();
  ctx.arc(ring.cx * dpr, ring.cy * dpr, r, 0, Math.PI * 2);
  ctx.strokeStyle = ring.col;
  ctx.globalAlpha = op;
  ctx.lineWidth   = (2.4 - prog * 1.8) * dpr;
  ctx.shadowColor = ring.col;
  ctx.shadowBlur  = 14 * dpr;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
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
    ctx.lineTo((p.x - p.vx * 4) * dpr, (p.y - p.vy * 4) * dpr);
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

function drawHUD(ctx, score, isNear, dpr) {
  const mono = "'Share Tech Mono', monospace";
  const col  = isNear ? C_NEAR : C_MAIN;
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isNear ? 10 * dpr : 6 * dpr;
  ctx.font        = `${16 * dpr}px ${mono}`;   // ← smaller font
  ctx.textAlign   = "left";
  ctx.fillText(String(score), 14 * dpr, 28 * dpr);
  ctx.shadowBlur  = 0;
}

/* ═══════════════════════ AUDIO ═════════════════════ */
const NEAR_FREQS = [880, 1046.5, 1174.7]; // pitch rises with near-miss combo

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

  const playNear = useCallback((combo = 0) => {
    const idx = Math.min(Math.floor(combo / 2), NEAR_FREQS.length - 1);
    playTone(NEAR_FREQS[idx], 0.07, "square", 0.06);
  }, [playTone]);

  const playBonus = useCallback(() => {
    // Sparkling ascending arpeggio for bomb pickup
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.18, "sine", 0.14), i * 55);
    });
  }, [playTone]);

  const playDeath = useCallback(() => {
    playTone(80,  0.5, "sawtooth", 0.22);
    playTone(55,  0.8, "sine",     0.18);
  }, [playTone]);

  return { soundOn, setSoundOn, playNear, playBonus, playDeath };
}

/* ═══════════════════════ COMPONENT ═════════════════ */
export const meta = {
  path: "/dodge",
  symbol: "△",
  name: "dodge",
  description: "navigate the asteroid field",
  status: "draft",
};

export default function DodgeGame() {
  const cvs    = useRef(null);
  const raf    = useRef(null);
  const g      = useRef(null);
  const starsR = useRef([]);
  const soundRef = useRef(null);

  const navigate = useNavigate();
  const [phase, setPhase] = useState("idle");
  const [score, setScore] = useState(0);
  const [best,  setBest]  = useState(0);

  const { soundOn, setSoundOn, playNear, playBonus, playDeath } = useSound();

  // Keep soundRef current so game-loop callbacks always see the latest functions
  useEffect(() => {
    soundRef.current = { playNear, playBonus, playDeath };
  }, [playNear, playBonus, playDeath]);

  useEffect(() => {
    const gen = () => {
      const c = cvs.current;
      const W = c ? c.offsetWidth  : 400;
      const H = c ? c.offsetHeight : 700;
      starsR.current = Array.from({ length: 90 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        sz: 0.5 + Math.random() * 1.3,
        a:  0.07 + Math.random() * 0.28,
      }));
    };
    gen();
    window.addEventListener("resize", gen);
    return () => window.removeEventListener("resize", gen);
  }, []);

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
    const ctx   = c.getContext("2d");
    const dpr   = window.devicePixelRatio || 1;
    const W     = c.width;
    const H     = c.height;
    const cssH  = c.offsetHeight;
    const shipY = cssH * 0.82;

    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, W, H);
    drawStars(ctx, starsR.current, dpr);
    drawScanlines(ctx, W, H);
    if (!s) return;

    // particles
    s.particles = s.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.life -= 0.022;
      return p.life > 0;
    });
    drawParticles(ctx, s.particles, dpr);

    // bomb shockwaves
    s.bombRings = (s.bombRings || []).filter(r => {
      r.t++;
      drawBombRing(ctx, r, dpr);
      return r.t < r.dur;
    });

    // bonus pickup
    if (s.bonus) drawBonus(ctx, s.bonus, dpr, s.frame);

    // asteroids
    for (const a of s.asteroids) {
      const dx     = a.x - s.px;
      const dy     = a.y - shipY;
      const dist   = Math.sqrt(dx * dx + dy * dy);
      const inNear = dist < a.r + NEAR_MISS_R && dist > a.r - NEAR_MISS_R + P_R;
      drawAsteroid(ctx, a, dpr, inNear ? (s.nearPulse || 0) : 0);
    }

    // ship
    const tilt = (s.tx - s.px) * 0.04;
    drawShip(ctx, s.px * dpr, shipY * dpr, dpr, tilt);

    drawHUD(ctx, s.score, s.isNear || false, dpr);
  }, []);

  /* ── chain-explode asteroids within BOMB_R ────────── */
  const triggerBomb = useCallback((cx, cy) => {
    const s = g.current;
    if (!s) return;
    const hit     = [];
    const survive = [];
    for (const a of s.asteroids) {
      const dx   = a.x - cx;
      const dy   = a.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < BOMB_R + a.r) hit.push(a);
      else survive.push(a);
    }
    s.asteroids = survive;
    s.score    += hit.length * BOMB_PTS;

    // sparks for each destroyed asteroid
    for (const a of hit) {
      s.particles.push(...mkSparks(a.x, a.y, 10, C_BOMB, 0.85));
      s.particles.push(...mkSparks(a.x, a.y,  5, C_MAIN, 0.5));
    }

    // shockwave rings from bomb centre
    const RING_DEFS = [
      { delay: 0,  maxR: BOMB_R * 1.05, dur: 38, col: "var(--mg-color-text-primary)" },
      { delay: 4,  maxR: BOMB_R * 0.80, dur: 42, col: C_BOMB    },
      { delay: 10, maxR: BOMB_R * 0.55, dur: 46, col: C_MAIN    },
    ];
    for (const rd of RING_DEFS) {
      setTimeout(() => {
        if (!g.current) return;
        g.current.bombRings.push({ cx, cy, t: 0, ...rd });
      }, rd.delay * (1000 / 60));
    }
  }, []);

  /* ── main loop ───────────────────────────────────── */
  const loop = useCallback(() => {
    const s = g.current;
    const c = cvs.current;
    if (!s || !s.on || !c) return;

    const cssW  = c.offsetWidth;
    const cssH  = c.offsetHeight;
    const shipY = cssH * 0.82;

    s.frame++;
    const speed    = SPD_INIT + s.frame * SPD_RAMP;
    const interval = Math.max(SPAWN_MIN, SPAWN_INIT - Math.floor(s.frame / 80) * 4);

    // spawn asteroids
    if (s.frame >= GRACE_F && s.frame % interval === 0) {
      s.asteroids.push(mkAsteroid(s.nid++, cssW, speed));
      if (s.frame > 220 && Math.random() < 0.28)
        s.asteroids.push(mkAsteroid(s.nid++, cssW, speed));
    }

    // spawn bonus pickup (one at a time, after grace period)
    if (!s.bonus && s.frame > GRACE_F && s.frame % BOMB_SPAWN_F === 0) {
      s.bonus = mkBonus(s.nid++, cssW);
    }

    // move asteroids
    s.asteroids = s.asteroids
      .map(a => ({ ...a, y: a.y + a.v, x: a.x + a.drift, rot: a.rot + a.rotV }))
      .filter(a => a.y - a.r < cssH + 16);

    // move + rotate bonus
    if (s.bonus) {
      s.bonus.y   += s.bonus.v;
      s.bonus.rot += s.bonus.rotV;
      if (s.bonus.y > cssH + 30) s.bonus = null;
    }

    // smooth player follow
    s.px += (s.tx - s.px) * 0.13;
    s.px  = Math.max(P_R, Math.min(cssW - P_R, s.px));

    // player picks up bonus
    if (s.bonus) {
      const dx   = s.bonus.x - s.px;
      const dy   = s.bonus.y - shipY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < s.bonus.r + P_R + 6) {
        const bx = s.bonus.x;
        const by = s.bonus.y;
        s.bonus  = null;
        soundRef.current?.playBonus();
        triggerBomb(bx, by);
      }
    }

    // collision + near-miss
    let dead    = false;
    let nearHit = false;
    s.nearPulse = Math.max(0, (s.nearPulse || 0) - 0.05);

    for (const a of s.asteroids) {
      const dx   = a.x - s.px;
      const dy   = a.y - shipY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < a.r + P_R - 8)                                   { dead = true; break; }
      if (dist < a.r + NEAR_MISS_R && dist > a.r - NEAR_MISS_R + P_R) {
        nearHit = true;
        s.nearPulse = 1;
      }
    }

    s.isNear = nearHit && !dead;

    if (nearHit && !dead) {
      s.nearCD = (s.nearCD || 0) - 1;
      if (s.nearCD <= 0) {
        s.score  += NEAR_PTS * (1 + Math.floor(s.combo / 4));
        s.nearCD  = NEAR_CD;
        s.combo  += 1;
        soundRef.current?.playNear(s.combo);
      }
    } else {
      s.nearCD = Math.max(0, (s.nearCD || 0) - 1);
      if (!nearHit) s.combo = 0;
    }

    s.score += 1;
    setScore(s.score);
    render();

    if (dead) {
      s.on = false;
      setBest(b => Math.max(b, s.score));
      soundRef.current?.playDeath();

      // ship fragments
      s.frags = [Math.PI * 0.5, Math.PI * 1.1, Math.PI * 1.9].map((ang, i) => ({
        x: s.px, y: shipY,
        vx: Math.cos(ang) * (2.2 + Math.random() * 2.8),
        vy: Math.sin(ang) * (2.2 + Math.random() * 2.8) - 1.2,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.22,
        life: 1.0, sz: P_R * (0.45 + i * 0.12),
      }));
      s.particles.push(...mkSparks(s.px, shipY, 22, C_MAIN, 1.1));
      s.particles.push(...mkSparks(s.px, shipY,  8, C_NEAR, 0.8));

      s.blast = { px: s.px, py: shipY, t: 0 };
      const RINGS = [
        { delay: 0,  dur: 40, maxR: 130, col: "var(--mg-color-text-primary)" },
        { delay: 4,  dur: 44, maxR: 100, col: C_MAIN    },
        { delay: 10, dur: 48, maxR: 70,  col: C_NEAR    },
      ];

      const explodeLoop = () => {
        const c2 = cvs.current;
        if (!c2) return;
        const ctx2 = c2.getContext("2d");
        const dpr2 = window.devicePixelRatio || 1;
        const W2   = c2.width;
        const H2   = c2.height;
        const b    = s.blast;
        b.t++;

        ctx2.fillStyle = C_BG;
        ctx2.fillRect(0, 0, W2, H2);
        drawStars(ctx2, starsR.current, dpr2);
        drawScanlines(ctx2, W2, H2);

        s.asteroids = s.asteroids.map(a => ({ ...a, y: a.y + a.v * 0.5, rot: a.rot + a.rotV }));
        for (const a of s.asteroids) drawAsteroid(ctx2, a, dpr2, 0);

        // screen flash
        if (b.t <= 8) {
          ctx2.fillStyle = `rgba(255,255,255,${(1 - b.t / 8) * 0.82})`;
          ctx2.fillRect(0, 0, W2, H2);
        }

        // shock rings
        for (const rng of RINGS) {
          const tf   = b.t - rng.delay;
          if (tf <= 0) continue;
          const prog = Math.min(tf / rng.dur, 1);
          const r    = prog * rng.maxR * dpr2;
          const op   = Math.pow(1 - prog, 1.5) * 0.95;
          if (op <= 0) continue;
          ctx2.beginPath();
          ctx2.arc(b.px * dpr2, b.py * dpr2, r, 0, Math.PI * 2);
          ctx2.strokeStyle = rng.col;
          ctx2.globalAlpha = op;
          ctx2.lineWidth   = (2.5 - prog * 1.8) * dpr2;
          ctx2.shadowColor = rng.col;
          ctx2.shadowBlur  = 16 * dpr2;
          ctx2.stroke();
          ctx2.globalAlpha = 1;
          ctx2.shadowBlur  = 0;
        }

        // sparks
        s.particles = s.particles.filter(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= 0.018;
          if (p.life <= 0) return false;
          ctx2.globalAlpha = p.life * p.life;
          ctx2.strokeStyle = p.col;
          ctx2.lineWidth   = p.w * dpr2;
          ctx2.shadowColor = p.col;
          ctx2.shadowBlur  = 6 * dpr2;
          ctx2.beginPath();
          ctx2.moveTo(p.x * dpr2, p.y * dpr2);
          ctx2.lineTo((p.x - p.vx * 5) * dpr2, (p.y - p.vy * 5) * dpr2);
          ctx2.stroke();
          ctx2.globalAlpha = 1;
          ctx2.shadowBlur  = 0;
          return true;
        });

        // tumbling fragments
        s.frags = s.frags.filter(f => {
          f.x += f.vx; f.y += f.vy; f.vy += 0.05;
          f.rot += f.rotV; f.life -= 0.014;
          if (f.life <= 0) return false;
          const sz = f.sz * dpr2;
          ctx2.save();
          ctx2.translate(f.x * dpr2, f.y * dpr2);
          ctx2.rotate(f.rot);
          ctx2.globalAlpha = f.life;
          ctx2.strokeStyle = C_MAIN;
          ctx2.shadowColor = C_MAIN;
          ctx2.shadowBlur  = 8 * dpr2;
          ctx2.lineWidth   = 1.4 * dpr2;
          ctx2.lineJoin    = "round";
          ctx2.beginPath();
          ctx2.moveTo(0, -sz * 1.5);
          ctx2.lineTo(sz, sz);
          ctx2.lineTo(-sz, sz);
          ctx2.closePath();
          ctx2.stroke();
          ctx2.restore();
          ctx2.globalAlpha = 1;
          ctx2.shadowBlur  = 0;
          return true;
        });

        if (b.t < 72) raf.current = requestAnimationFrame(explodeLoop);
        else setPhase("done");
      };

      raf.current = requestAnimationFrame(explodeLoop);
      return;
    }

    raf.current = requestAnimationFrame(loop);
  }, [render, triggerBomb]);

  /* ── start ───────────────────────────────────────── */
  const start = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const c = cvs.current;
    if (!c) return;
    g.current = {
      on: true, frame: 0, score: 0,
      px: c.offsetWidth / 2, tx: c.offsetWidth / 2,
      asteroids: [], particles: [], frags: [], bombRings: [],
      bonus: null, nid: 0,
      nearPulse: 0, nearCD: 0, combo: 0, isNear: false,
    };
    setPhase("playing");
    setScore(0);
    raf.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if ((e.code !== "Space" && e.key !== " ") || (phase !== "idle" && phase !== "done")) return;
      e.preventDefault();
      start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, start]);

  useEffect(() => {
    if (phase !== "playing") render();
  }, [phase, render]);

  const track = useCallback(e => {
    if (!g.current?.on) return;
    const c    = cvs.current;
    const rect = c.getBoundingClientRect();
    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
    g.current.tx = cx - rect.left;
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ═══════════════════════ UI ═════════════════════ */
  const mono = "'Share Tech Mono','Courier New',monospace";

  const Overlay = ({ children }) => (
    <div style={{
      position:"absolute", inset:0,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      animation:"fadeIn 0.55s ease", fontFamily: mono,
    }}>{children}</div>
  );

  const Label = ({ children, style }) => (
    <div style={{ color:C_MAIN, fontSize:11, letterSpacing:5, opacity:0.5, textTransform:"uppercase", ...style }}>
      {children}
    </div>
  );

  const Btn = ({ onClick, children }) => (
    <button
      style={{
        marginTop:52, background:"transparent",
        border:`1px solid rgba(255,255,255,0.27)`, color:C_MAIN,
        fontFamily:mono, fontSize:11, letterSpacing:5,
        padding:"14px 36px", cursor:"pointer",
        textTransform:"uppercase", textShadow:`0 0 8px ${C_MAIN}`,
        transition:"border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor=C_MAIN; e.currentTarget.style.boxShadow=`0 0 18px ${C_MAIN}44`; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor=`rgba(255,255,255,0.27)`; e.currentTarget.style.boxShadow="none"; }}
      onClick={onClick}
    >{children}</button>
  );

  const ShipSVG = () => (
    <svg width="40" height="56" viewBox="0 0 40 56" fill="none"
      style={{ marginBottom:20, filter:`drop-shadow(0 0 10px ${C_MAIN})` }}>
      <polygon points="20,2 38,54 2,54" stroke={C_MAIN} strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div style={{
      width:"100vw", height:"100dvh", background:C_BG,
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
    <div className="game-area" style={{
      position:"relative",
      width:430,
      height:760,
      maxWidth:"calc(100vw - 32px)",
      maxHeight:"calc(100dvh - 32px)",
      overflow:"hidden",
      userSelect:"none", touchAction:"none",
      outline:"1px dashed var(--mg-color-text-subtle)",
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

      {/* ── SOUND TOGGLE + HUB (always visible) ── */}
      <SoundToggleButton soundOn={soundOn} setSoundOn={setSoundOn} />
      <HubButton onClick={() => navigate("/")} />

      <canvas
        ref={cvs}
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", animation:"flicker 7s infinite" }}
        onMouseMove={track}
        onTouchMove={e=>{ e.preventDefault(); track(e); }}
      />

      {/* IDLE */}
      {phase === "idle" && (
        <Overlay>
          <Label style={{ fontSize:10, letterSpacing:8, marginBottom:18 }}>— sector 7 —</Label>
          <ShipSVG />
          <div style={{
            color:C_MAIN, fontSize:40, letterSpacing:12, lineHeight:1,
            textShadow:`0 0 28px ${C_MAIN}`, fontFamily:mono, marginBottom:6,
          }}>DODGE</div>
          <Label style={{ fontSize:10, marginBottom:40 }}>asteroid belt</Label>

          <div style={{ display:"flex", gap:28, marginTop:4 }}>
            {[
              ["MOVE",    "cursor / touch"],
              ["NEAR MISS",`+${NEAR_PTS}pts × chain`],
              ["◆ BONUS",  "collect → chain explosion"],
            ].map(([k,v]) => (
              <div key={k} style={{ textAlign:"center" }}>
                <div style={{ color:C_MAIN, fontSize:9, letterSpacing:3, opacity:0.55 }}>{k}</div>
                <div style={{ color:C_MAIN, fontSize:9, letterSpacing:1, opacity:0.2, marginTop:3 }}>{v}</div>
              </div>
            ))}
          </div>

          {best > 0 && (
            <Label style={{ marginTop:34, fontSize:10, letterSpacing:4, opacity:0.22 }}>BEST &nbsp; {best}</Label>
          )}
          <Btn onClick={start}>launch</Btn>
        </Overlay>
      )}

      {/* DONE */}
      {phase === "done" && (
        <div style={{
          position:"absolute", inset:0,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          fontFamily:mono, background:C_BG,
          animation:"fadeIn 0.5s ease",
        }}>
          <div style={{ width:48, height:1, background:C_MAIN, opacity:0.4, marginBottom:28 }} />
          <div style={{ color:C_MAIN, fontSize:11, letterSpacing:6, textTransform:"uppercase", opacity:0.55, marginBottom:18 }}>
            game over
          </div>
          <div style={{
            color:C_MAIN, fontSize:80, fontWeight:400, letterSpacing:-2, lineHeight:1,
            textShadow:`0 0 40px ${C_MAIN}88`,
          }}>{score}</div>
          <div style={{
            color: score >= best ? C_MAIN : "var(--mg-color-text-primary)",
            fontSize:11, letterSpacing:5, textTransform:"uppercase",
            opacity: score >= best ? 0.9 : 0.35,
            marginTop:14,
            textShadow: score >= best ? `0 0 12px ${C_MAIN}` : "none",
          }}>
            {score >= best ? "★ new best" : `best  ${best}`}
          </div>
          <div style={{ width:48, height:1, background:C_MAIN, opacity:0.4, marginTop:32 }} />
          <button
            style={{
              marginTop:40, background:"transparent",
              border:`1px solid ${C_MAIN}`, color:C_MAIN,
              fontFamily:mono, fontSize:12, letterSpacing:6,
              padding:"16px 44px", cursor:"pointer",
              textTransform:"uppercase", textShadow:`0 0 10px ${C_MAIN}`,
              transition:"box-shadow 0.2s, background 0.2s",
            }}
            onMouseEnter={e=>{ e.currentTarget.style.background=`${C_MAIN}11`; e.currentTarget.style.boxShadow=`0 0 28px ${C_MAIN}55`; }}
            onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.boxShadow="none"; }}
            onClick={start}
          >again</button>
        </div>
      )}
    </div>
    </div>
  );
}
