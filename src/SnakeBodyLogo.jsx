const HEAD_FILL = "var(--mg-color-surface-strong)";
const BODY_BORDERS = ["rgba(15,20,25,0.65)", "rgba(15,20,25,0.42)"];
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
