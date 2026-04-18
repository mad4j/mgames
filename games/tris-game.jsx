import { useState, useEffect, useCallback } from "react";

/* ═══════════════════════ PALETTE ═══════════════════ */
const C_BG   = "#0a0a0a";
const C_MAIN = "rgba(255,255,255,0.88)";
const C_GRID = "rgba(255,255,255,0.14)";
const C_WIN  = "rgba(255,255,255,1)";

/* ═══════════════════════ CONSTANTS ═════════════════ */
const MAX_SYMBOLS = 3;
const CELL        = 110;
const BOARD_PX    = CELL * 3;

/* ═══════════════════════ GAME LOGIC ════════════════ */
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return { player: board[a], line };
  }
  return null;
}

function applyMove(board, xMoves, oMoves, player, pos) {
  const newBoard  = [...board];
  const newXMoves = [...xMoves];
  const newOMoves = [...oMoves];
  const moves     = player === "X" ? newXMoves : newOMoves;

  if (moves.length === MAX_SYMBOLS) {
    newBoard[moves[0]] = null;
    moves.shift();
  }

  newBoard[pos] = player;
  moves.push(pos);

  return { board: newBoard, xMoves: newXMoves, oMoves: newOMoves };
}

function emptyCellsAfterVanish(board, moves) {
  const after = [...board];
  if (moves.length === MAX_SYMBOLS) after[moves[0]] = null;
  return after.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0);
}

function aiMove(board, xMoves, oMoves) {
  const empty = emptyCellsAfterVanish(board, oMoves);
  if (empty.length === 0) return null;

  // 1. Winning move
  for (const pos of empty) {
    const next = applyMove(board, xMoves, oMoves, "O", pos);
    if (checkWinner(next.board)) return pos;
  }

  // 2. Block opponent
  const xEmpty = emptyCellsAfterVanish(board, xMoves);
  for (const pos of xEmpty) {
    const next = applyMove(board, xMoves, oMoves, "X", pos);
    if (checkWinner(next.board) && empty.includes(pos)) return pos;
  }

  // 3. Prefer center, then corners, then random
  const priority = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  for (const pos of priority) {
    if (empty.includes(pos)) return pos;
  }
  return empty[Math.floor(Math.random() * empty.length)];
}

function initGame() {
  return {
    board:  Array(9).fill(null),
    xMoves: [],
    oMoves: [],
    turn:   "X",
    result: null,
  };
}

/* ═══════════════════════ COMPONENT ═════════════════ */
export const meta = {
  path:        "/tris",
  symbol:      "✕",
  name:        "tris",
  description: "vanishing tic-tac-toe",
  status:      "draft",
};

export default function TrisGame() {
  const mono = "'Share Tech Mono','Courier New',monospace";

  const [phase, setPhase] = useState("idle");
  const [game,  setGame]  = useState(initGame);
  const [wins,  setWins]  = useState({ X: 0, O: 0 });

  /* ── AI move ─────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "playing" || game.result || game.turn !== "O") return;

    const id = setTimeout(() => {
      setGame(prev => {
        if (prev.turn !== "O" || prev.result) return prev;

        const pos = aiMove(prev.board, prev.xMoves, prev.oMoves);
        if (pos === null) return prev;

        const next   = applyMove(prev.board, prev.xMoves, prev.oMoves, "O", pos);
        const result = checkWinner(next.board);

        return { ...prev, ...next, turn: result ? "O" : "X", result: result || null };
      });
    }, 420);

    return () => clearTimeout(id);
  }, [phase, game.turn, game.result]);

  /* ── update win counters & transition to done ────── */
  useEffect(() => {
    if (!game.result || phase !== "playing") return;

    if (game.result.player) {
      setWins(prev => ({ ...prev, [game.result.player]: prev[game.result.player] + 1 }));
    }

    const id = setTimeout(() => setPhase("done"), 820);
    return () => clearTimeout(id);
  }, [game.result, phase]);

  /* ── handle player click ─────────────────────────── */
  const handleClick = useCallback(pos => {
    setGame(prev => {
      if (prev.turn !== "X" || prev.result) return prev;

      // cell must be empty after the potential vanish of oldest X symbol
      const afterVanish = [...prev.board];
      if (prev.xMoves.length === MAX_SYMBOLS) afterVanish[prev.xMoves[0]] = null;
      if (afterVanish[pos] !== null) return prev;

      const next   = applyMove(prev.board, prev.xMoves, prev.oMoves, "X", pos);
      const result = checkWinner(next.board);

      return { ...prev, ...next, turn: result ? "X" : "O", result: result || null };
    });
  }, []);

  /* ── start / restart ─────────────────────────────── */
  const start = useCallback(() => {
    setGame(initGame());
    setPhase("playing");
  }, []);

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

  /* ═══════════════════════ RENDER HELPERS ═════════════ */
  const xGhost = game.xMoves.length === MAX_SYMBOLS ? game.xMoves[0] : -1;
  const oGhost = game.oMoves.length === MAX_SYMBOLS ? game.oMoves[0] : -1;

  const winLine = game.result?.line ?? null;

  /* ── board cell ───────────────────────────────────── */
  const Cell = ({ i }) => {
    const val     = game.board[i];
    const row     = Math.floor(i / 3);
    const col     = i % 3;
    const isGhost = (val === "X" && xGhost === i) || (val === "O" && oGhost === i);
    const isWin   = winLine?.includes(i);

    const afterVanish = [...game.board];
    if (game.xMoves.length === MAX_SYMBOLS) afterVanish[game.xMoves[0]] = null;
    const canClick =
      phase === "playing" &&
      game.turn === "X" &&
      !game.result &&
      afterVanish[i] === null;

    const opacity = isWin ? 1 : isGhost ? 0.18 : 0.85;
    const glow    = isWin ? `drop-shadow(0 0 10px ${C_WIN})` : isGhost ? "none" : "none";

    return (
      <div
        onClick={() => canClick && handleClick(i)}
        style={{
          position: "absolute",
          left:   col * CELL,
          top:    row * CELL,
          width:  CELL,
          height: CELL,
          cursor: canClick ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "opacity 0.25s",
        }}
      >
        {val === "X" && (
          <svg
            width={CELL * 0.42}
            height={CELL * 0.42}
            viewBox="0 0 40 40"
            fill="none"
            style={{ opacity, filter: glow, transition: "opacity 0.3s" }}
          >
            <line x1="6" y1="6" x2="34" y2="34" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
            <line x1="34" y1="6" x2="6" y2="34" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        )}
        {val === "O" && (
          <svg
            width={CELL * 0.42}
            height={CELL * 0.42}
            viewBox="0 0 40 40"
            fill="none"
            style={{ opacity, filter: glow, transition: "opacity 0.3s" }}
          >
            <circle cx="20" cy="20" r="13" stroke="white" strokeWidth="2.8" />
          </svg>
        )}
      </div>
    );
  };

  /* ── winning line overlay ─────────────────────────── */
  const WinLineOverlay = () => {
    if (!winLine) return null;
    const [a, _b, c] = winLine;
    const rA = Math.floor(a / 3), cA = a % 3;
    const rC = Math.floor(c / 3), cC = c % 3;
    const x1 = (cA + 0.5) * CELL;
    const y1 = (rA + 0.5) * CELL;
    const x2 = (cC + 0.5) * CELL;
    const y2 = (rC + 0.5) * CELL;
    return (
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        width={BOARD_PX}
        height={BOARD_PX}
      >
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.55"
          strokeDasharray="6 4"
        />
      </svg>
    );
  };

  /* ── board ────────────────────────────────────────── */
  const Board = () => (
    <div style={{ position: "relative", width: BOARD_PX, height: BOARD_PX }}>
      {/* grid lines */}
      {[1, 2].map(i => (
        <div key={`lines${i}`}>
          <div style={{ position:"absolute", left: i*CELL-0.5, top:0, width:1, height:BOARD_PX, background:C_GRID }} />
          <div style={{ position:"absolute", top: i*CELL-0.5, left:0, height:1, width:BOARD_PX, background:C_GRID }} />
        </div>
      ))}
      {game.board.map((_, i) => <Cell key={i} i={i} />)}
      <WinLineOverlay />
    </div>
  );

  /* ── shared sub-components ────────────────────────── */
  const Label = ({ children, style }) => (
    <div style={{ color:C_MAIN, fontSize:11, letterSpacing:5, opacity:0.45, textTransform:"uppercase", ...style }}>
      {children}
    </div>
  );

  const Btn = ({ onClick, children }) => (
    <button
      style={{
        marginTop: 44,
        background: "transparent",
        border: `1px solid rgba(255,255,255,0.27)`,
        color: C_MAIN,
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: 5,
        padding: "14px 36px",
        cursor: "pointer",
        textTransform: "uppercase",
        textShadow: `0 0 8px ${C_MAIN}`,
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C_MAIN; e.currentTarget.style.boxShadow = `0 0 18px rgba(255,255,255,0.22)`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.27)"; e.currentTarget.style.boxShadow = "none"; }}
      onClick={onClick}
    >
      {children}
    </button>
  );

  /* ══════════════════════════════════════════════════ */
  return (
    <div style={{
      width: "100vw",
      height: "100dvh",
      background: C_BG,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: mono,
      userSelect: "none",
    }}>
      <div className="game-area" style={{
        position: "relative",
        width: 430,
        height: 760,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100dvh - 32px)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        outline: "1px dashed rgba(255,255,255,0.12)",
      }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes flicker { 0%,100%{opacity:1} 92%{opacity:.96} 94%{opacity:.80} 96%{opacity:.98} }
      `}</style>

      {/* ── IDLE ─────────────────────────────────────── */}
      {phase === "idle" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:0, animation:"fadeIn 0.55s ease" }}>
          <Label style={{ fontSize:10, letterSpacing:8, marginBottom:20 }}>— board game —</Label>

          <div style={{
            color: C_MAIN,
            fontSize: 44,
            letterSpacing: 14,
            lineHeight: 1,
            textShadow: `0 0 28px ${C_MAIN}`,
            marginBottom: 10,
          }}>
            TRIS
          </div>

          <Label style={{ marginBottom: 36 }}>vanishing tic-tac-toe</Label>

          <div style={{ display:"flex", gap:28, marginBottom:4 }}>
            {[
              ["YOU",    "play as  ✕"],
              ["VANISH", "3 pieces max"],
              ["WIN",    "3 in a row"],
            ].map(([k, v]) => (
              <div key={k} style={{ textAlign:"center" }}>
                <div style={{ color:C_MAIN, fontSize:9, letterSpacing:3, opacity:0.55 }}>{k}</div>
                <div style={{ color:C_MAIN, fontSize:9, letterSpacing:1, opacity:0.2, marginTop:3 }}>{v}</div>
              </div>
            ))}
          </div>

          <Btn onClick={start}>play</Btn>
        </div>
      )}

      {/* ── PLAYING ──────────────────────────────────── */}
      {phase === "playing" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:28, animation:"fadeIn 0.4s ease" }}>

          {/* scoreboard */}
          <div style={{ display:"flex", gap:56, alignItems:"flex-end" }}>
            {[["YOU", "X"], ["AI", "O"]].map(([label, player]) => (
              <div key={player} style={{
                textAlign: "center",
                transition: "opacity 0.2s",
                opacity: game.turn === player && !game.result ? 1 : 0.3,
              }}>
                <div style={{ color:C_MAIN, fontSize:9, letterSpacing:4, opacity:0.55, marginBottom:4 }}>{label}</div>
                <div style={{ color:C_MAIN, fontSize:28, letterSpacing:2 }}>{wins[player]}</div>
              </div>
            ))}
          </div>

          <Board />

          <Label style={{ opacity: game.result ? 0 : 0.4, transition:"opacity 0.2s" }}>
            {game.turn === "X" ? "your turn" : "thinking…"}
          </Label>
        </div>
      )}

      {/* ── DONE ─────────────────────────────────────── */}
      {phase === "done" && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
          animation: "fadeIn 0.5s ease",
          fontFamily: mono,
        }}>
          <div style={{ width:48, height:1, background:C_MAIN, opacity:0.35, marginBottom:28 }} />

          <div style={{ color:C_MAIN, fontSize:11, letterSpacing:6, textTransform:"uppercase", opacity:0.5, marginBottom:18 }}>
            {game.result?.player === "X" ? "you win" : "ai wins"}
          </div>

          <div style={{
            color: C_MAIN,
            fontSize: 72,
            letterSpacing: 4,
            lineHeight: 1,
            textShadow: `0 0 40px rgba(255,255,255,0.5)`,
            marginBottom: 6,
          }}>
            {game.result?.player === "X" ? "✕" : "○"}
          </div>

          <div style={{ color:C_MAIN, fontSize:11, letterSpacing:5, opacity:0.28, marginBottom:32 }}>
            {wins.X} — {wins.O}
          </div>

          <Board />

          <div style={{ width:48, height:1, background:C_MAIN, opacity:0.35, marginTop:32 }} />

          <Btn onClick={start}>again</Btn>
        </div>
      )}
      </div>
    </div>
  );
}
