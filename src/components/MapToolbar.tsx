interface Props {
  disabled: boolean;
  onZoom: (delta: number) => void;
  onNational: () => void;
  parentName?: string;
  onParent: () => void;
  townshipsAvailable: boolean;
  townshipsVisible: boolean;
  onToggleTownships: () => void;
  flowsVisible: boolean;
  onToggleFlows: () => void;
}

export function MapToolbar({
  disabled,
  onZoom,
  onNational,
  parentName,
  onParent,
  townshipsAvailable,
  townshipsVisible,
  onToggleTownships,
  flowsVisible,
  onToggleFlows,
}: Props) {
  return (
    <div className="map-tools" aria-label="地图工具">
      <button
        id="zoom-in"
        title="放大"
        aria-label="放大"
        disabled={disabled}
        onClick={() => onZoom(1)}
      >
        ＋
      </button>
      <button
        id="zoom-out"
        title="缩小"
        aria-label="缩小"
        disabled={disabled}
        onClick={() => onZoom(-1)}
      >
        −
      </button>
      <span className="tool-divider" />
      <button
        id="toggle-flows"
        title={flowsVisible ? "隐藏流空间" : "显示流空间"}
        aria-label="流空间"
        aria-pressed={flowsVisible}
        disabled={disabled}
        onClick={onToggleFlows}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18C6 9 15 6 20 6M4 18c5-4 10-5 16-3" />
          <circle cx="4" cy="18" r="1.6" />
          <circle cx="20" cy="6" r="1.6" />
        </svg>
      </button>
      {townshipsAvailable && (
        <button
          id="toggle-townships"
          title={townshipsVisible ? "隐藏乡镇界线和名称" : "显示乡镇界线和名称"}
          aria-label="乡镇界线和名称"
          aria-pressed={townshipsVisible}
          disabled={disabled}
          onClick={onToggleTownships}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 16l9 5 9-5" />
          </svg>
        </button>
      )}
      {parentName && (
        <button
          id="back-parent"
          title={`返回${parentName}`}
          aria-label={`返回${parentName}`}
          disabled={disabled}
          onClick={onParent}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 6 6v3" />
          </svg>
        </button>
      )}
      <button
        id="home-national"
        title="返回全国"
        aria-label="返回全国"
        disabled={disabled}
        onClick={onNational}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <ellipse cx="12" cy="12" rx="3.5" ry="8" />
          <path d="M4 12h16" />
        </svg>
      </button>
    </div>
  );
}
