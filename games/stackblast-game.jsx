import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const ROWS = 12;
const COLS = 7;
const CELL = 52;
const SHAPES = 5;
const SPAWN_MS = 700;

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

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

function getDropRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (!board[row][col]) return row;
  }
  return -1;
}

function spawnToken(board, nextIdRef) {
  const cols = [];
  for (let col = 0; col < COLS; col++) {
    if (getDropRow(board, col) !== -1) cols.push(col);
  }
  if (cols.length === 0) return { board, placed: false };

  const col = cols[randomInt(cols.length)];
  const row = getDropRow(board, col);
  const next = board.map((r) => [...r]);

  next[row][col] = {
    id: nextIdRef.current++,
    type: randomInt(SHAPES),
    drop: row + 1,
    motion: 0,
  };

  return { board: next, placed: true };
}

function collapse(board) {
  const next = emptyBoard();

  for (let col = 0; col < COLS; col++) {
    let write = ROWS - 1;
    for (let row = ROWS - 1; row >= 0; row--) {
      const token = board[row][col];
      if (!token) continue;
      const distance = write - row;
      next[write][col] = {
        ...token,
        drop: distance,
        motion: distance > 0 ? token.motion + 1 : token.motion,
      };
      write--;
    }
  }

  return next;
}

function collectGroup(board, startRow, startCol) {
  const first = board[startRow][startCol];
  if (!first) return [];

  const target = first.type;
  const key = (r, c) => `${r},${c}`;
  const seen = new Set([key(startRow, startCol)]);
  const stack = [[startRow, startCol]];
  const group = [];

  while (stack.length) {
    const [row, col] = stack.pop();
    group.push([row, col]);

    const near = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];

    for (const [nr, nc] of near) {
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (!board[nr][nc] || board[nr][nc].type !== target) continue;
      const id = key(nr, nc);
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push([nr, nc]);
    }
  }

  return group;
}

export const meta = {
  path: "/stackblast",
  symbol: "◉",
  name: "stackblast",
  description: "tap adjacent matching chains",
};

export default function StackBlastGame() {
  const navigate = useNavigate();
  const nextId = useRef(1);

  const [phase, setPhase] = useState("idle");
  const [board, setBoard] = useState(emptyBoard);
  const [score, setScore] = useState(0);
  const [lastPop, setLastPop] = useState(0);

  const start = useCallback(() => {
    nextId.current = 1;
    setBoard(emptyBoard());
    setScore(0);
    setLastPop(0);
    setPhase("playing");
  }, []);

  const clearDropTrail = useCallback(() => {
    setBoard((prev) =>
      prev.map((row) =>
        row.map((token) => (token && token.drop > 0 ? { ...token, drop: 0 } : token))
      )
    );
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const interval = setInterval(() => {
      setBoard((prev) => {
        const spawned = spawnToken(prev, nextId);
        if (!spawned.placed) {
          setPhase("done");
          return prev;
        }
        return spawned.board;
      });
    }, SPAWN_MS);

    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timeout = setTimeout(clearDropTrail, 260);
    return () => clearTimeout(timeout);
  }, [board, phase, clearDropTrail]);

  const tokens = useMemo(() => {
    const out = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const token = board[row][col];
        if (!token) continue;
        out.push({ row, col, token });
      }
    }
    return out;
  }, [board]);

  const onTap = useCallback((row, col) => {
    if (phase !== "playing") return;

    setBoard((prev) => {
      if (!prev[row][col]) return prev;
      const group = collectGroup(prev, row, col);
      if (group.length < 2) return prev;

      const next = prev.map((r) => [...r]);
      for (const [gr, gc] of group) next[gr][gc] = null;

      const collapsed = collapse(next);
      setScore((s) => s + group.length * group.length);
      setLastPop(group.length);
      return collapsed;
    });
  }, [phase]);

  const boardW = COLS * CELL;
  const boardH = ROWS * CELL;

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
        @keyframes fallIn {
          from { transform: translate(-50%, calc(-50% - var(--drop))); opacity: 0.2; }
          to { transform: translate(-50%, -50%); opacity: 1; }
        }
        @keyframes popMsg {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          20% { opacity: 0.12; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.12); }
        }
      `}</style>

      <div
        style={{
          width: 430,
          height: 760,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100dvh - 32px)",
          position: "relative",
          outline: "1px dashed rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => navigate("/")}
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.45)",
            fontSize: 14,
            letterSpacing: 2,
            cursor: "pointer",
          }}
        >
          hub
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
                top: "56%",
                width: boardW,
                height: boardH,
                transform: "translate(-50%, -50%)",
                border: "1px solid rgba(255,255,255,0.16)",
                boxSizing: "border-box",
              }}
            >
              {tokens.map(({ row, col, token }) => (
                <button
                  key={`${token.id}-${token.motion}`}
                  onPointerDown={() => onTap(row, col)}
                  style={{
                    position: "absolute",
                    left: col * CELL + CELL / 2,
                    top: row * CELL + CELL / 2,
                    width: CELL - 8,
                    height: CELL - 8,
                    borderRadius: "50%",
                    border: "1.5px solid rgba(255,255,255,0.75)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transform: "translate(-50%, -50%)",
                    animation: token.drop > 0 ? "fallIn 0.22s ease" : undefined,
                    ['--drop']: `${token.drop * CELL}px`,
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
            <div style={{ marginTop: 20, fontSize: 11, letterSpacing: 4, opacity: 0.45, textTransform: "uppercase" }}>
              stackblast
            </div>
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
