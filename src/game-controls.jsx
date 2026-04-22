function IconSound({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="2,6 6,6 10,2 10,16 6,12 2,12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      {on ? (
        <>
          <path d="M12.5 6.5 C13.8 7.3 13.8 10.7 12.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M14.5 4.5 C17 6 17 12 14.5 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <line x1="12" y1="6" x2="17" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="17" y1="6" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

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

const iconButtonBaseStyle = {
  position: "absolute",
  top: 14,
  zIndex: 20,
  background: "transparent",
  border: "none",
  color: "var(--mg-color-text-dim)",
  cursor: "pointer",
  padding: 6,
  lineHeight: 0,
  transition: "color 0.2s",
};

function onPointerDownMaybeStop(stopPropagation) {
  if (!stopPropagation) return undefined;
  return (event) => event.stopPropagation();
}

export function SoundToggleButton({
  soundOn,
  setSoundOn,
  right = 52,
  onColor = "var(--mg-color-text-dim)",
  offColor = "var(--mg-color-text-weak)",
  hoverColor = "var(--mg-color-text-hover)",
  style,
  stopPropagation = false,
}) {
  return (
    <button
      aria-label={soundOn ? "mute" : "unmute"}
      onClick={() => setSoundOn(!soundOn)}
      onPointerDown={onPointerDownMaybeStop(stopPropagation)}
      onMouseEnter={(e) => (e.currentTarget.style.color = hoverColor)}
      onMouseLeave={(e) => (e.currentTarget.style.color = soundOn ? onColor : offColor)}
      style={{
        ...iconButtonBaseStyle,
        right,
        color: soundOn ? onColor : offColor,
        ...style,
      }}
    >
      <IconSound on={soundOn} />
    </button>
  );
}

export function HubButton({
  onClick,
  right = 12,
  color = "var(--mg-color-text-dim)",
  hoverColor = "var(--mg-color-text-hover)",
  style,
  stopPropagation = false,
}) {
  return (
    <button
      aria-label="back to hub"
      onClick={onClick}
      onPointerDown={onPointerDownMaybeStop(stopPropagation)}
      onMouseEnter={(e) => (e.currentTarget.style.color = hoverColor)}
      onMouseLeave={(e) => (e.currentTarget.style.color = color)}
      style={{
        ...iconButtonBaseStyle,
        right,
        color,
        ...style,
      }}
    >
      <IconHub />
    </button>
  );
}
