import { useState, useEffect, useRef, useCallback } from "react";

// ─── Math helpers ─────────────────────────────────────────────
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

const GRAV   = 0.30;
const BALL_R = 9;
const FLIP_R = 5;

function makeState(W, H) {
  const fy  = H * 0.84;
  const fl  = W * 0.22;
  const fLx = W * 0.28, fRx = W * 0.72;

  return {
    W, H,
    ball: { x: W * 0.5, y: H * 0.28, vx: (Math.random() - .5) * 1.2, vy: 1.8 },
    fL: { px: fLx, py: fy, len: fl, a: 0.35, up: -0.46, dn: 0.35 },
    fR: { px: fRx, py: fy, len: fl, a: Math.PI - 0.35, up: Math.PI + 0.46, dn: Math.PI - 0.35 },
    guides: [
      [0, H * 0.58, fLx, fy],
      [W, H * 0.58, fRx, fy],
    ],
    targets: [
      // Pop bumpers – circle, explosive, +100
      { type: 'bumper',  x: W*.50, y: H*.10, r: 24, pts: 100, fl: 0 },
      { type: 'bumper',  x: W*.27, y: H*.21, r: 18, pts: 100, fl: 0 },
      { type: 'bumper',  x: W*.73, y: H*.21, r: 18, pts: 100, fl: 0 },
      // Diamond targets – angular, soft bounce, +75
      { type: 'diamond', x: W*.25, y: H*.38, r: 14, pts: 75, fl: 0 },
      { type: 'diamond', x: W*.75, y: H*.38, r: 14, pts: 75, fl: 0 },
      // Slingshot kickers – line segment with boost, +50
      { type: 'kicker', x1: W*.05, y1: H*.52, x2: W*.20, y2: H*.42, pts: 50, fl: 0 },
      { type: 'kicker', x1: W*.95, y1: H*.52, x2: W*.80, y2: H*.42, pts: 50, fl: 0 },
      // Star – disappears on hit, respawns after 3s, +200
      { type: 'star', x: W*.50, y: H*.34, r: 11, pts: 200, fl: 0, hidden: false, respawnAt: 0 },
    ],
    score: 0,
    lives: 3,
  };
}

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

export const meta = {
  path:        "/pinball",
  symbol:      "◉",
  name:        "pinball",
  description: "flip the ball, beat your best",
};

export default function Pinball() {
  const cvRef  = useRef(null);
  const gsRef  = useRef(null);
  const rafRef = useRef(null);
  const keys   = useRef({ l: false, r: false });
  const phase  = useRef("idle");
  const [ui, setUi] = useState({ p: "idle", score: 0, lives: 3, best: 0, newBest: false });

  const loop = useCallback(() => {
    const cv = cvRef.current;
    if (!cv || !gsRef.current || phase.current !== "playing") return;
    const ctx = cv.getContext("2d");
    const g   = gsRef.current;
    const { W, H, ball, fL, fR, guides, targets } = g;
    const now = Date.now();

    // Star respawn
    targets.forEach(t => {
      if (t.type === 'star' && t.hidden && now > t.respawnAt) t.hidden = false;
    });

    // Flipper lerp
    fL.a = lerp(fL.a, keys.current.l ? fL.up : fL.dn, 0.28);
    fR.a = lerp(fR.a, keys.current.r ? fR.up : fR.dn, 0.28);

    // Physics
    ball.vy += GRAV;
    ball.x  += ball.vx;
    ball.y  += ball.vy;
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > 22) { ball.vx *= 22 / spd; ball.vy *= 22 / spd; }

    // Side walls + ceiling
    if (ball.x < BALL_R)     { ball.x = BALL_R;     ball.vx =  Math.abs(ball.vx) * 0.72; }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.72; }
    if (ball.y < BALL_R)     { ball.y = BALL_R;      ball.vy =  Math.abs(ball.vy) * 0.65; }

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

    // Targets
    targets.forEach(t => {
      if (t.type === 'bumper') {
        const dx = ball.x - t.x, dy = ball.y - t.y;
        const d  = Math.hypot(dx, dy);
        const md = BALL_R + t.r;
        if (d < md && d > 0.001) {
          const nx = dx / d, ny = dy / d;
          ball.x = t.x + nx * md; ball.y = t.y + ny * md;
          const s = Math.max(Math.hypot(ball.vx, ball.vy), 10);
          ball.vx = nx * s * 1.45; ball.vy = ny * s * 1.45;
          if (now - t.fl > 180) { t.fl = now; g.score += t.pts; setUi(u => ({ ...u, score: g.score })); }
        }
      }
      if (t.type === 'diamond') {
        const dx = ball.x - t.x, dy = ball.y - t.y;
        const d  = Math.hypot(dx, dy);
        const md = BALL_R + t.r;
        if (d < md && d > 0.001) {
          const nx = dx / d, ny = dy / d;
          ball.x = t.x + nx * md; ball.y = t.y + ny * md;
          const dot = ball.vx * nx + ball.vy * ny;
          if (dot < 0) { ball.vx -= 2 * dot * nx * 0.78; ball.vy -= 2 * dot * ny * 0.78; }
          if (now - t.fl > 200) { t.fl = now; g.score += t.pts; setUi(u => ({ ...u, score: g.score })); }
        }
      }
      if (t.type === 'kicker') {
        const { hit, nx, ny } = reflectSeg(ball, t.x1, t.y1, t.x2, t.y2, 0.82);
        if (hit && now - t.fl > 260) {
          t.fl = now;
          ball.vx += nx * 5.5; ball.vy += ny * 5.5;
          g.score += t.pts;
          setUi(u => ({ ...u, score: g.score }));
        }
      }
      if (t.type === 'star' && !t.hidden) {
        const dx = ball.x - t.x, dy = ball.y - t.y;
        const d  = Math.hypot(dx, dy);
        const md = BALL_R + t.r + 3;
        if (d < md && d > 0.001) {
          const nx = dx / d, ny = dy / d;
          ball.x = t.x + nx * md; ball.y = t.y + ny * md;
          const s = Math.max(Math.hypot(ball.vx, ball.vy), 9);
          ball.vx = nx * s * 1.3; ball.vy = ny * s * 1.3;
          t.fl = now; t.hidden = true; t.respawnAt = now + 3000;
          g.score += t.pts;
          setUi(u => ({ ...u, score: g.score }));
        }
      }
    });

    // Drain
    if (ball.y > H + 30) {
      g.lives--;
      if (g.lives <= 0) {
        phase.current = "done";
        setUi(u => {
          const nb = g.score >= u.best;
          return { ...u, p: "done", score: g.score, best: Math.max(u.best, g.score), newBest: nb };
        });
        return;
      }
      ball.x = W * 0.5; ball.y = H * 0.28;
      ball.vx = (Math.random() - .5) * 1.2; ball.vy = 1.8;
      setUi(u => ({ ...u, lives: g.lives }));
    }

    // ── DRAW ──────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    // Guide rails
    ctx.strokeStyle = "rgba(255,255,255,0.11)";
    ctx.lineWidth   = 1;
    ctx.lineCap     = "round";
    guides.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });

    // Central drain hint
    const tipLx = fL.px + Math.cos(fL.dn) * fL.len;
    const tipRx = fR.px + Math.cos(fR.dn) * fR.len;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
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
          // Countdown ghost
          const elapsed = now - t.fl;
          const wait    = t.respawnAt - t.fl;
          const prog    = Math.min(1, elapsed / wait);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = `rgba(255,255,255,${0.03 + prog * 0.09})`;
          ctx.lineWidth   = 1;
          ctx.setLineDash([2, 6]);
          pathStar(ctx, t.x, t.y, t.r);
          ctx.stroke();
          ctx.setLineDash([]);
        }
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
  const btn = {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.22)",
    color: "#fff", fontFamily: "'DM Mono',monospace",
    fontSize: 11, letterSpacing: 5,
    padding: "14px 36px", cursor: "pointer", textTransform: "uppercase",
  };

  return (
    <div style={{
      width: "100vw", height: "100dvh", background: "#0a0a0a",
      overflow: "hidden", position: "relative",
      fontFamily: "'DM Mono','Courier New',monospace",
      userSelect: "none", touchAction: "none",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap');
        @keyframes fadeIn {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        button:hover { border-color: rgba(255,255,255,0.6) !important; }
      `}</style>

      <canvas
        ref={cvRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        onPointerDown={onPD}
        onPointerUp={onPU}
        onPointerLeave={onPU}
      />

      {p === "playing" && <>
        <div style={{
          position: "absolute", top: 18, left: 24, zIndex: 10,
          color: "#fff", fontSize: 32, fontWeight: 300, letterSpacing: -1,
          pointerEvents: "none",
        }}>{score}</div>

        <div style={{
          position: "absolute", top: 22, right: 24, zIndex: 10,
          color: "#fff", fontSize: 12, letterSpacing: 4, opacity: 0.5,
          pointerEvents: "none",
        }}>{"●".repeat(Math.max(0, lives))}</div>

        <div style={{
          position: "absolute", bottom: 42, right: 16, zIndex: 10,
          color: "#fff", fontSize: 8, letterSpacing: 3, opacity: 0.13,
          pointerEvents: "none", textAlign: "right", lineHeight: 2.2,
          textTransform: "uppercase",
        }}>○ 100<br />◇ &nbsp;75<br />— &nbsp;50<br />★ 200</div>

        <div style={{
          position: "absolute", bottom: 18, left: "50%",
          transform: "translateX(-50%)",
          color: "#fff", fontSize: 9, letterSpacing: 5, opacity: 0.11,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>Z · · · X &nbsp;&nbsp;&nbsp; ← · · · →</div>
      </>}

      {p === "idle" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.6s ease",
        }}>
          <div style={{ color:"#fff", fontSize:11, letterSpacing:6, marginBottom:32, opacity:0.28, textTransform:"uppercase" }}>flipper</div>
          <div style={{ color:"#fff", fontSize:72, fontWeight:300, lineHeight:1 }}>◉</div>
          <div style={{ color:"#fff", fontSize:10, letterSpacing:4, marginTop:20, opacity:0.18 }}>3 balls</div>
          {best > 0 && <div style={{ color:"#fff", fontSize:11, letterSpacing:3, marginTop:36, opacity:0.18 }}>best {best}</div>}
          <button style={{ ...btn, marginTop: 52 }} onClick={start}>start</button>
        </div>
      )}

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
          <button style={{ ...btn, marginTop: 56 }} onClick={start}>again</button>
        </div>
      )}
    </div>
  );
}
