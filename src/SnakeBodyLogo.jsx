const HEAD_FILL = "var(--mg-accent-cyan, #00d4ff)";
const BODY_BORDERS = ["rgba(0, 212, 255, 0.65)", "rgba(155, 89, 245, 0.45)"];
const BORDER_WIDTH = "1.5px";
const [FIRST_BODY_BORDER, SECOND_BODY_BORDER] = BODY_BORDERS;

export default function SnakeBodyLogo({ size = 12, headSize, gap = 4 }) {
  const resolvedHeadSize = headSize ?? size + 2;
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap, opacity: 0.85 }}>
      <div style={{ width: resolvedHeadSize, height: resolvedHeadSize, background: HEAD_FILL }} />
      <div style={{ width: size, height: size, border: `${BORDER_WIDTH} solid ${FIRST_BODY_BORDER}` }} />
      <div style={{ width: size, height: size, border: `${BORDER_WIDTH} solid ${SECOND_BODY_BORDER}` }} />
    </div>
  );
}
