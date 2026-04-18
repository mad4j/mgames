import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ── Constants ─────────────────────────────────────────────────
const GRAV               = 0.30;
const BALL_R             = 9;
const FLIP_R             = 5;
const LANE_W             = 36;   // right launch-lane width (px)
const LANE_BOTTOM        = 0.87; // separator ends at this fraction of H
const GALLERY_ARCH_Y     = BALL_R * 3; // y-height of the exit gallery arch (px from top)
const STAR_COLL_PAD      = 3;    // extra radius for star collision detection
const ROLLOVER_TOLERANCE = 4;    // vertical hit tolerance for rollover gates

// ── Math helpers ──────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function closestPt(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.001) return { cx: ax, cy: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { cx: ax + t * dx, cy: ay + t * dy };
}

function reflectSeg(ball, ax, ay, bx, by, rest = 0.70) {
  const { cx, cy } = closestPt(ax, ay, bx, by, ball.x, ball.y);
  const dx = ball.x - cx, dy = ball.y - cy;
  const d  = Math.hypot(dx, dy);
  const md = BALL_R + 3;
  if (d < md && d > 0.001) {
    const nx = dx / d, ny = dy / d;
    ball.x = cx + nx * md;
    ball.y = cy + ny * md;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) { ball.vx -= 2 * dot * nx * rest; ball.vy -= 2 * dot * ny * rest; }
    return { hit: true, nx, ny };
  }
  return { hit: false, nx: 0, ny: 0 };
}

// ── Drawing helpers ───────────────────────────────────────────
function pathDiamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x,          y - r);
  ctx.lineTo(x + r * .8, y);
  ctx.lineTo(x,          y + r);
  ctx.lineTo(x - r * .8, y);
  ctx.closePath();
}

function pathStar(ctx, x, y, R, n = 5) {
  const r = R * 0.42;
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a   = (i * Math.PI / n) - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else         ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

function pathTriangle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x,              y - r);
  ctx.lineTo(x + r * 0.866,  y + r * 0.5);
  ctx.lineTo(x - r * 0.866,  y + r * 0.5);
  ctx.closePath();
}

// ── Game state factory ────────────────────────────────────────
function makeState(W, H) {
  const PW  = W - LANE_W;          // effective play-field width
  const fy  = H * 0.84;
  const fl  = PW * 0.22;
  const fLx = PW * 0.18, fRx = PW * 0.82;

  return {
    W, H, PW,
    ball: { x: W - LANE_W * 0.4, y: H * 0.81, vx: 0, vy: 0 },
    inLane: true,
    galleryExit: false,
    launchAt: Date.now() + 900,
    fL: { px: fLx, py: fy, len: fl, a: 0.35, up: -0.46, dn: 0.35 },
    fR: { px: fRx, py: fy, len: fl, a: Math.PI - 0.35, up: Math.PI + 0.46, dn: Math.PI - 0.35 },
    guides: [
      [0,   H * 0.58, fLx, fy],
      [PW,  H * 0.58, fRx, fy],
    ],
    targets: [
      // ── Top bumpers ─────────────────────────────────────────────
      { type: 'bumper',   x: PW*.50, y: H*.08, r: 20, pts: 100, fl: 0 },
      { type: 'bumper',   x: PW*.26, y: H*.17, r: 16, pts: 100, fl: 0 },
      { type: 'bumper',   x: PW*.74, y: H*.17, r: 16, pts: 100, fl: 0 },
      // ── Middle bumpers ──────────────────────────────────────────
      { type: 'bumper',   x: PW*.40, y: H*.29, r: 14, pts: 150, fl: 0 },
      { type: 'bumper',   x: PW*.60, y: H*.29, r: 14, pts: 150, fl: 0 },
      // ── Diamonds ────────────────────────────────────────────────
      { type: 'diamond',  x: PW*.18, y: H*.37, r: 13, pts: 75,  fl: 0 },
      { type: 'diamond',  x: PW*.82, y: H*.37, r: 13, pts: 75,  fl: 0 },
      { type: 'diamond',  x: PW*.50, y: H*.43, r: 12, pts: 75,  fl: 0 },
      { type: 'diamond',  x: PW*.30, y: H*.53, r: 11, pts: 75,  fl: 0 },
      { type: 'diamond',  x: PW*.70, y: H*.53, r: 11, pts: 75,  fl: 0 },
      // ── Triangles ───────────────────────────────────────────────
      { type: 'triangle', x: PW*.50, y: H*.22, r: 12, pts: 150, fl: 0 },
      { type: 'triangle', x: PW*.22, y: H*.47, r: 11, pts: 150, fl: 0 },
      { type: 'triangle', x: PW*.78, y: H*.47, r: 11, pts: 150, fl: 0 },
      // ── Slingshot kickers ───────────────────────────────────────
      { type: 'kicker', x1: PW*.05, y1: H*.54, x2: PW*.20, y2: H*.44, pts: 50, fl: 0 },
      { type: 'kicker', x1: PW*.95, y1: H*.54, x2: PW*.80, y2: H*.44, pts: 50, fl: 0 },
      // ── Stars ───────────────────────────────────────────────────
      { type: 'star', x: PW*.50, y: H*.34, r: 11, pts: 200, fl: 0, hidden: false, respawnAt: 0 },
      { type: 'star', x: PW*.24, y: H*.25, r:  9, pts: 200, fl: 0, hidden: false, respawnAt: 0 },
      { type: 'star', x: PW*.76, y: H*.25, r:  9, pts: 200, fl: 0, hidden: false, respawnAt: 0 },
      // ── Rollovers (horizontal gates – pass-through, +50) ────────
      { type: 'rollover', x: PW*.50, y: H*.62, w: PW*.18, pts: 50, fl: 0 },
      { type: 'rollover', x: PW*.25, y: H*.68, w: PW*.12, pts: 50, fl: 0 },
      { type: 'rollover', x: PW*.75, y: H*.68, w: PW*.12, pts: 50, fl: 0 },
    ],
    score: 0,
    lives: 3,
  };
}

// ── Audio hook ────────────────────────────────────────────────
function useSound() {
  const ctxRef     = useRef(null);
  const enabledRef = useRef(true);
  const [soundOn, _setSoundOn] = useState(true);

  const setSoundOn = (v) => { enabledRef.current = v; _setSoundOn(v); };

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

  const playBumper   = useCallback(() => playTone(440, 0.08, "square",   0.10), [playTone]);
  const playDiamond  = useCallback(() => playTone(660, 0.07, "square",   0.09), [playTone]);
  const playTriangle = useCallback(() => playTone(550, 0.09, "square",   0.10), [playTone]);
  const playKicker   = useCallback(() => playTone(330, 0.10, "sawtooth", 0.10), [playTone]);
  const playStar     = useCallback(() => playTone(880, 0.20, "sine",     0.18), [playTone]);
  const playDrain    = useCallback(() => playTone(110, 0.40, "sine",     0.20), [playTone]);
  const playRollover = useCallback(() => playTone(528, 0.06, "sine",     0.10), [playTone]);

  return { soundOn, setSoundOn, playBumper, playDiamond, playTriangle, playKicker, playStar, playDrain, playRollover };
}

// ── Icon components ───────────────────────────────────────────
function IconSound({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* speaker body */}
      <polygon points="2,6 6,6 10,2 10,16 6,12 2,12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
      {on ? (
        <>
          {/* wave 1 */}
          <path d="M12.5 6.5 C13.8 7.3 13.8 10.7 12.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
          {/* wave 2 */}
          <path d="M14.5 4.5 C17 6 17 12 14.5 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
        </>
      ) : (
        <>
          {/* mute X */}
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

export const meta = {
  path:        "/pinball",
  symbol:      "◉",
  name:        "pinball",
  description: "flip the ball, beat your best",
  status:      "draft",
};

export default function Pinball() {
  const navigate = useNavigate();
  const cvRef  = useRef(null);
  const gsRef  = useRef(null);
  const rafRef = useRef(null);
  const keys   = useRef({ l: false, r: false });
  const phase  = useRef("idle");  const [ui, setUi] = useState({ p: "idle", score: 0, lives: 3, best: 0, newBest: false });

  const { soundOn, setSoundOn, playBumper, playDiamond, playTriangle, playKicker, playStar, playDrain, playRollover } = useSound();

  // Keep sound callbacks accessible inside the rAF loop without stale closures
  const sndRef = useRef({});
  useEffect(() => {
    sndRef.current = { playBumper, playDiamond, playTriangle, playKicker, playStar, playDrain, playRollover };
  }, [playBumper, playDiamond, playTriangle, playKicker, playStar, playDrain, playRollover]);

  const loop = useCallback(() => {
    const cv = cvRef.current;
    if (!cv || !gsRef.current || phase.current !== "playing") return;
    const ctx = cv.getContext("2d");
    const g   = gsRef.current;
    const { W, H, PW, ball, fL, fR, guides, targets } = g;
    const now = Date.now();
    const snd = sndRef.current;

    // Star respawn
    targets.forEach(t => {
      if (t.type === 'star' && t.hidden && now > t.respawnAt) t.hidden = false;
    });

    // ── Auto-launch from lane ──────────────────────────────────
    if (g.inLane) {
      if (now >= g.launchAt) {
        g.inLane = false;
        ball.vx  = -4;
        ball.vy  = -24;
      }
    } else {
      // Flipper lerp
      fL.a = lerp(fL.a, keys.current.l ? fL.up : fL.dn, 0.28);
      fR.a = lerp(fR.a, keys.current.r ? fR.up : fR.dn, 0.28);

      // Physics
      ball.vy += GRAV;
      ball.x  += ball.vx;
      ball.y  += ball.vy;
      const spd = Math.hypot(ball.vx, ball.vy);
      if (spd > 22) { ball.vx *= 22 / spd; ball.vy *= 22 / spd; }

      // Left wall + ceiling
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.72; }
      if (ball.y < BALL_R) { ball.y = BALL_R;  ball.vy = Math.abs(ball.vy) * 0.65; }

      // Right canvas wall (lane right edge)
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.72; }

      // ── Gallery arch exit ──────────────────────────────────────────
      // When the ball reaches the arch at the top of the launch lane it
      // is released at the centre of the screen (x = W/2) and falls from
      // the top, following the gallery's physical path.
      if (!g.galleryExit && ball.x > PW && ball.y < GALLERY_ARCH_Y) {
        g.galleryExit = true;
        ball.x  = W * 0.5;
        ball.y  = BALL_R + 1;
        ball.vx = 0;
        ball.vy = 2;
      }

      // ── Separator wall ─────────────────────────────────────────
      // Bidirectional: prevents crossing in both directions between
      // the main field and the launch lane. The ball must travel all
      // the way up the lane and exit through the gallery arch at the top.
      if (ball.y > GALLERY_ARCH_Y && ball.y < H * LANE_BOTTOM) {
        // main field → lane
        if (ball.x < PW && ball.x + BALL_R >= PW && ball.vx > 0) {
          ball.x = PW - BALL_R;
          ball.vx = -Math.abs(ball.vx) * 0.60;
        }
        // lane → main field (ball must exit through gallery arch at top)
        if (ball.x >= PW && ball.x - BALL_R <= PW && ball.vx < 0) {
          ball.x = PW + BALL_R;
          ball.vx = Math.abs(ball.vx) * 0.60;
        }
      }

      // Guide rails
      guides.forEach(([x1, y1, x2, y2]) => reflectSeg(ball, x1, y1, x2, y2, 0.58));

      // Flippers
      function doFlip(f, isLeft) {
        const ex = f.px + Math.cos(f.a) * f.len;
        const ey = f.py + Math.sin(f.a) * f.len;
        const { cx, cy } = closestPt(f.px, f.py, ex, ey, ball.x, ball.y);
        const dx = ball.x - cx, dy = ball.y - cy;
        const d  = Math.hypot(dx, dy);
        const md = BALL_R + FLIP_R;
        if (d < md && d > 0.001) {
          const nx = dx / d, ny = dy / d;
          ball.x = cx + nx * md;
          ball.y = cy + ny * md;
          const dot = ball.vx * nx + ball.vy * ny;
          if (dot < 0) { ball.vx -= 2 * dot * nx * 0.72; ball.vy -= 2 * dot * ny * 0.72; }
          const active   = isLeft ? keys.current.l : keys.current.r;
          const swinging = isLeft ? (f.a - f.up > 0.08) : (f.up - f.a > 0.08);
          if (active && swinging) { ball.vy -= 9.5; ball.vx += isLeft ? 3 : -3; }
        }
      }
      doFlip(fL, true);
      doFlip(fR, false);

      // Targets collision
      targets.forEach(t => {
        // ○ Bumper – explosive circular repulsion
        if (t.type === 'bumper') {
          const dx = ball.x - t.x, dy = ball.y - t.y;
          const d  = Math.hypot(dx, dy);
          const md = BALL_R + t.r;
          if (d < md && d > 0.001) {
            const nx = dx / d, ny = dy / d;
            ball.x = t.x + nx * md; ball.y = t.y + ny * md;
            const s = Math.max(Math.hypot(ball.vx, ball.vy), 10);
            ball.vx = nx * s * 1.45; ball.vy = ny * s * 1.45;
            if (now - t.fl > 180) { t.fl = now; g.score += t.pts; snd.playBumper(); setUi(u => ({ ...u, score: g.score })); }
          }
        }

        // ◇ Diamond – soft angled bounce
        if (t.type === 'diamond') {
          const dx = ball.x - t.x, dy = ball.y - t.y;
          const d  = Math.hypot(dx, dy);
          const md = BALL_R + t.r;
          if (d < md && d > 0.001) {
            const nx = dx / d, ny = dy / d;
            ball.x = t.x + nx * md; ball.y = t.y + ny * md;
            const dot = ball.vx * nx + ball.vy * ny;
            if (dot < 0) { ball.vx -= 2 * dot * nx * 0.78; ball.vy -= 2 * dot * ny * 0.78; }
            if (now - t.fl > 200) { t.fl = now; g.score += t.pts; snd.playDiamond(); setUi(u => ({ ...u, score: g.score })); }
          }
        }

        // △ Triangle – sharp deflection
        if (t.type === 'triangle') {
          const dx = ball.x - t.x, dy = ball.y - t.y;
          const d  = Math.hypot(dx, dy);
          const md = BALL_R + t.r;
          if (d < md && d > 0.001) {
            const nx = dx / d, ny = dy / d;
            ball.x = t.x + nx * md; ball.y = t.y + ny * md;
            const dot = ball.vx * nx + ball.vy * ny;
            if (dot < 0) { ball.vx -= 2 * dot * nx * 0.85; ball.vy -= 2 * dot * ny * 0.85; }
            if (now - t.fl > 200) { t.fl = now; g.score += t.pts; snd.playTriangle(); setUi(u => ({ ...u, score: g.score })); }
          }
        }

        // — Kicker – slingshot speed boost
        if (t.type === 'kicker') {
          const { hit, nx, ny } = reflectSeg(ball, t.x1, t.y1, t.x2, t.y2, 0.82);
          if (hit && now - t.fl > 260) {
            t.fl = now;
            ball.vx += nx * 5.5; ball.vy += ny * 5.5;
            g.score += t.pts;
            snd.playKicker();
            setUi(u => ({ ...u, score: g.score }));
          }
        }

        // ★ Star – vanishes on hit, respawns after 3 s
        if (t.type === 'star' && !t.hidden) {
          const dx = ball.x - t.x, dy = ball.y - t.y;
          const d  = Math.hypot(dx, dy);
          const md = BALL_R + t.r + STAR_COLL_PAD;
          if (d < md && d > 0.001) {
            const nx = dx / d, ny = dy / d;
            ball.x = t.x + nx * md; ball.y = t.y + ny * md;
            const s = Math.max(Math.hypot(ball.vx, ball.vy), 9);
            ball.vx = nx * s * 1.3; ball.vy = ny * s * 1.3;
            t.fl = now; t.hidden = true; t.respawnAt = now + 3000;
            g.score += t.pts;
            snd.playStar();
            setUi(u => ({ ...u, score: g.score }));
          }
        }

        // ── Rollover – horizontal gate, pass-through, +pts ──────
        if (t.type === 'rollover') {
          const dy = Math.abs(ball.y - t.y);
          if (dy < BALL_R + ROLLOVER_TOLERANCE && ball.x > t.x - t.w / 2 && ball.x < t.x + t.w / 2) {
            if (now - t.fl > 350) {
              t.fl = now; g.score += t.pts;
              snd.playRollover();
              setUi(u => ({ ...u, score: g.score }));
            }
          }
        }
      });

      // ── Drain ────────────────────────────────────────────────
      if (ball.y > H + 30) {
        if (ball.x < PW) {
          // Drained from main field – lose a life
          g.lives--;
          snd.playDrain();
          if (g.lives <= 0) {
            phase.current = "done";
            setUi(u => {
              const nb = g.score >= u.best;
              return { ...u, p: "done", score: g.score, best: Math.max(u.best, g.score), newBest: nb };
            });
            return;
          }
          setUi(u => ({ ...u, lives: g.lives }));
        }
        // Reset ball to launch lane
        ball.x = W - LANE_W * 0.4; ball.y = H * 0.81;
        ball.vx = 0; ball.vy = 0;
        g.inLane      = true;
        g.galleryExit = false;
        g.launchAt    = now + 900;
      }
    }

    // ── Draw ──────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    // Lane background
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    ctx.fillRect(PW, 0, LANE_W, H);

    // Separator wall (main field / lane divider)
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.moveTo(PW, GALLERY_ARCH_Y);
    ctx.lineTo(PW, H * LANE_BOTTOM);
    ctx.stroke();

    // Gallery arch: horizontal corridor at the top of the lane that
    // guides the ball from the lane exit to the centre of the screen.
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(W - 3, GALLERY_ARCH_Y);
    ctx.lineTo(W * 0.5, GALLERY_ARCH_Y);   // horizontal ceiling to screen centre
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.5, GALLERY_ARCH_Y);
    ctx.lineTo(W * 0.5, GALLERY_ARCH_Y + BALL_R * 3.5);  // short drop marker at centre
    ctx.stroke();

    // Guide rails
    ctx.strokeStyle = "rgba(255,255,255,0.11)";
    ctx.lineWidth   = 1;
    guides.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });

    // Drain gap hint (dashed)
    const tipLx = fL.px + Math.cos(fL.dn) * fL.len;
    const tipRx = fR.px + Math.cos(fR.dn) * fR.len;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 8]);
    ctx.beginPath();
    ctx.moveTo(tipLx, fL.py + Math.sin(fL.dn) * fL.len + 6);
    ctx.lineTo(tipRx, fR.py + Math.sin(fR.dn) * fR.len + 6);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw targets
    targets.forEach(t => {
      const fa = t.fl > 0 ? Math.max(0, 1 - (now - t.fl) / 300) : 0;

      if (t.type === 'bumper') {
        ctx.shadowBlur  = fa > 0 ? 14 * fa : 0;
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.26 + fa * 0.60})`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        if (fa > 0) { ctx.fillStyle = `rgba(255,255,255,${fa * 0.10})`; ctx.fill(); }
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.28 + fa * 0.52})`;
        ctx.fill();
      }

      if (t.type === 'diamond') {
        ctx.shadowBlur  = fa > 0 ? 12 * fa : 0;
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        pathDiamond(ctx, t.x, t.y, t.r);
        ctx.strokeStyle = `rgba(255,255,255,${0.30 + fa * 0.58})`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        if (fa > 0) { ctx.fillStyle = `rgba(255,255,255,${fa * 0.13})`; ctx.fill(); }
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y - 4); ctx.lineTo(t.x, t.y + 4);
        ctx.moveTo(t.x - 4, t.y); ctx.lineTo(t.x + 4, t.y);
        ctx.strokeStyle = `rgba(255,255,255,${0.15 + fa * 0.35})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (t.type === 'triangle') {
        ctx.shadowBlur  = fa > 0 ? 12 * fa : 0;
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        pathTriangle(ctx, t.x, t.y, t.r);
        ctx.strokeStyle = `rgba(255,255,255,${0.32 + fa * 0.56})`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        if (fa > 0) { ctx.fillStyle = `rgba(255,255,255,${fa * 0.12})`; ctx.fill(); }
        ctx.shadowBlur = 0;
      }

      if (t.type === 'kicker') {
        ctx.shadowBlur  = fa > 0 ? 10 * fa : 0;
        ctx.shadowColor = "rgba(255,255,255,0.8)";
        ctx.strokeStyle = `rgba(255,255,255,${0.42 + fa * 0.52})`;
        ctx.lineWidth   = fa > 0 ? 3.5 : 2.5;
        ctx.lineCap     = "round";
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
        // Serration ticks
        const dx = t.x2 - t.x1, dy = t.y2 - t.y1;
        const len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = `rgba(255,255,255,${0.18 + fa * 0.28})`;
        ctx.lineWidth   = 1;
        [-0.35, 0, 0.35].forEach(off => {
          const bx = t.x1 + ux * len * (0.5 + off * 0.5);
          const by = t.y1 + uy * len * (0.5 + off * 0.5);
          ctx.beginPath();
          ctx.moveTo(bx, by); ctx.lineTo(bx + nx * 6, by + ny * 6);
          ctx.stroke();
        });
      }

      if (t.type === 'star') {
        if (!t.hidden) {
          ctx.shadowBlur  = fa > 0 ? 20 * fa : 5;
          ctx.shadowColor = "rgba(255,255,255,0.8)";
          pathStar(ctx, t.x, t.y, t.r);
          ctx.strokeStyle = `rgba(255,255,255,${0.55 + fa * 0.40})`;
          ctx.lineWidth   = 1.5;
          ctx.stroke();
          if (fa > 0) { ctx.fillStyle = `rgba(255,255,255,${fa * 0.18})`; ctx.fill(); }
          ctx.shadowBlur = 0;
        } else {
          // Ghost countdown
          const elapsed = now - t.fl;
          const wait    = t.respawnAt - t.fl;
          const prog    = Math.min(1, elapsed / wait);
          ctx.shadowBlur  = 0;
          ctx.strokeStyle = `rgba(255,255,255,${0.03 + prog * 0.09})`;
          ctx.lineWidth   = 1;
          ctx.setLineDash([2, 6]);
          pathStar(ctx, t.x, t.y, t.r);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ── Rollover ─────────────────────────────────────────────
      if (t.type === 'rollover') {
        ctx.shadowBlur  = fa > 0 ? 8 * fa : 0;
        ctx.shadowColor = "rgba(255,255,255,0.7)";
        ctx.strokeStyle = `rgba(255,255,255,${0.30 + fa * 0.55})`;
        ctx.lineWidth   = fa > 0 ? 3 : 1.5;
        ctx.lineCap     = "round";
        ctx.beginPath();
        ctx.moveTo(t.x - t.w / 2, t.y);
        ctx.lineTo(t.x + t.w / 2, t.y);
        ctx.stroke();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = `rgba(255,255,255,${0.15 + fa * 0.25})`;
        ctx.lineWidth   = 1;
        [-1, 1].forEach(sign => {
          const ex = t.x + sign * t.w / 2;
          ctx.beginPath();
          ctx.moveTo(ex, t.y - 4); ctx.lineTo(ex, t.y + 4);
          ctx.stroke();
        });
      }
    });

    ctx.shadowBlur = 0;

    // Flippers
    ctx.lineCap = "round";
    [fL, fR].forEach(f => {
      ctx.beginPath();
      ctx.moveTo(f.px, f.py);
      ctx.lineTo(f.px + Math.cos(f.a) * f.len, f.py + Math.sin(f.a) * f.len);
      ctx.strokeStyle = "rgba(255,255,255,0.84)";
      ctx.lineWidth   = FLIP_R * 2;
      ctx.stroke();
    });

    // Ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle   = "rgba(255,255,255,0.09)";
    ctx.strokeStyle = "rgba(255,255,255,0.90)";
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();

    // Launch-lane arrow (shown while ball is queued in lane)
    if (g.inLane) {
      const prog  = 1 - Math.max(0, g.launchAt - now) / 900;
      const laneX = W - LANE_W * 0.4;
      const aY    = ball.y - 35;
      ctx.strokeStyle = `rgba(255,255,255,${0.10 + prog * 0.28})`;
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = "round";
      ctx.beginPath();
      ctx.moveTo(laneX, aY + 18); ctx.lineTo(laneX, aY);
      ctx.lineTo(laneX - 5, aY + 8);
      ctx.moveTo(laneX, aY);
      ctx.lineTo(laneX + 5, aY + 8);
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.width  = cv.offsetWidth;
    cv.height = cv.offsetHeight;
    gsRef.current = makeState(cv.offsetWidth, cv.offsetHeight);
    phase.current = "playing";
    setUi(u => ({ ...u, p: "playing", score: 0, lives: 3 }));
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // Keyboard controls
  useEffect(() => {
    const kd = e => {
      if (["ArrowLeft",  "z","Z","a","A"].includes(e.key)) keys.current.l = true;
      if (["ArrowRight", "x","X","l","L","/"].includes(e.key)) keys.current.r = true;
    };
    const ku = e => {
      if (["ArrowLeft",  "z","Z","a","A"].includes(e.key)) keys.current.l = false;
      if (["ArrowRight", "x","X","l","L","/"].includes(e.key)) keys.current.r = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup",   ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if ((e.code !== "Space" && e.key !== " ") || (ui.p !== "idle" && ui.p !== "done")) return;
      e.preventDefault();
      start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.p, start]);

  // Touch / pointer controls
  const onPD = e => {
    if (phase.current !== "playing") return;
    const r = cvRef.current?.getBoundingClientRect();
    if (!r) return;
    if (e.clientX < r.left + r.width / 2) keys.current.l = true;
    else keys.current.r = true;
  };
  const onPU = () => { keys.current.l = false; keys.current.r = false; };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const { p, score, lives, best, newBest } = ui;

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
    position: "absolute", top: 14, zIndex: 30,
    background: "transparent", border: "none",
    color: "rgba(255,255,255,0.38)",
    cursor: "pointer", padding: 6,
    lineHeight: 0,
    transition: "color 0.2s",
  };

  return (
    <div style={{
      width: "100vw", height: "100dvh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div className="game-area" style={{
        position: "relative",
        width: 380,
        height: 760,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100dvh - 32px)",
        overflow: "hidden",
        userSelect: "none",
        fontFamily: "'DM Mono', 'Courier New', monospace",
        touchAction: "none",
        outline: "1px dashed rgba(255,255,255,0.12)",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
          * { -webkit-tap-highlight-color: transparent; }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* ── Sound toggle ── */}
        <button
          aria-label={soundOn ? "mute" : "unmute"}
          onClick={() => setSoundOn(!soundOn)}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
          onMouseLeave={e => e.currentTarget.style.color = soundOn ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.18)"}
          style={{ ...iconBtnStyle, right: 52, color: `rgba(255,255,255,${soundOn ? 0.38 : 0.18})` }}
        >
          <IconSound on={soundOn} />
        </button>

        {/* ── Hub button ── */}
        <button
          aria-label="back to hub"
          onClick={() => navigate("/")}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.38)"}
          style={{ ...iconBtnStyle, right: 12 }}
        >
          <IconHub />
        </button>

        {/* ── Canvas ── */}
        <canvas
          ref={cvRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          onPointerDown={onPD}
          onPointerUp={onPU}
          onPointerLeave={onPU}
        />

        {/* ── Playing HUD ── */}
        {p === "playing" && <>
          <div style={{
            position: "absolute", top: 18, left: 24, zIndex: 10,
            color: "#fff", fontSize: 32, fontWeight: 300, letterSpacing: -1,
            pointerEvents: "none",
          }}>{score}</div>

          <div style={{
            position: "absolute", bottom: 18, left: 0, right: LANE_W, zIndex: 10,
            textAlign: "center",
            color: "#fff", fontSize: 12, letterSpacing: 4, opacity: 0.5,
            pointerEvents: "none",
          }}>{"●".repeat(Math.max(0, lives))}</div>
        </>}

        {/* ── Idle screen ── */}
        {p === "idle" && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            animation: "fadeIn 0.6s ease",
          }}>
            <div style={{ color:"#fff", fontSize:11, letterSpacing:6, marginBottom:32, opacity:0.28, textTransform:"uppercase" }}>pinball</div>
            <div style={{ color:"#fff", fontSize:72, fontWeight:300, lineHeight:1 }}>◉</div>
            <div style={{ color:"#fff", fontSize:10, letterSpacing:4, marginTop:20, opacity:0.18 }}>3 balls</div>
            {best > 0 && <div style={{ color:"#fff", fontSize:11, letterSpacing:3, marginTop:36, opacity:0.18 }}>best {best}</div>}
            <button
              style={{ ...BtnStyle, marginTop: 52 }}
              onMouseEnter={e => e.target.style.borderColor="rgba(255,255,255,0.6)"}
              onMouseLeave={e => e.target.style.borderColor="rgba(255,255,255,0.22)"}
              onClick={start}
            >start</button>
          </div>
        )}

        {/* ── Done screen ── */}
        {p === "done" && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            animation: "fadeIn 0.5s ease",
          }}>
            <div style={{ color:"#fff", fontSize:11, letterSpacing:6, opacity:0.28, textTransform:"uppercase", marginBottom:16 }}>score</div>
            <div style={{ color:"#fff", fontSize:88, fontWeight:300, letterSpacing:-4, lineHeight:1 }}>{score}</div>
            {newBest && score > 0
              ? <div style={{ color:"#fff", fontSize:10, letterSpacing:5, opacity:0.32, marginTop:12, textTransform:"uppercase" }}>new best</div>
              : <div style={{ color:"#fff", fontSize:10, letterSpacing:4, opacity:0.2,  marginTop:12 }}>best {best}</div>
            }
            <button
              style={{ ...BtnStyle, marginTop: 56 }}
              onMouseEnter={e => e.target.style.borderColor="rgba(255,255,255,0.6)"}
              onMouseLeave={e => e.target.style.borderColor="rgba(255,255,255,0.22)"}
              onClick={start}
            >again</button>
          </div>
        )}
      </div>
    </div>
  );
}
