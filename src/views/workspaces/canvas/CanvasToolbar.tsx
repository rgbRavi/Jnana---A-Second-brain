import styles from './canvas.module.css'

export type CanvasMode = 'select' | 'draw'
export type DrawTool = 'pen' | 'eraser'

interface Props {
  mode: CanvasMode
  onSetMode: (m: CanvasMode) => void
  drawTool: DrawTool
  onSetDrawTool: (t: DrawTool) => void
  color: string
  onColor: (c: string) => void
  onAddText: () => void
  onAddNote: () => void
  onAddMedia: () => void
  onAddWeb: () => void
  scale: number
  onZoom: (dir: 1 | -1) => void
  onFit: () => void
}

export function CanvasToolbar({
  mode, onSetMode, drawTool, onSetDrawTool, color, onColor,
  onAddText, onAddNote, onAddMedia, onAddWeb, scale, onZoom, onFit,
}: Props) {
  return (
    <div className={styles.toolbar}>
      <button
        className={`${styles.toolBtn} ${mode === 'select' ? styles.toolBtnOn : ''}`}
        onClick={() => onSetMode('select')}
        title="Select / move (V)"
      >
        ↖ Select
      </button>
      <button
        className={`${styles.toolBtn} ${mode === 'draw' ? styles.toolBtnOn : ''}`}
        onClick={() => onSetMode('draw')}
        title="Draw (D)"
      >
        ✏️ Draw
      </button>

      {mode === 'draw' && (
        <>
          <button
            className={`${styles.toolBtn} ${drawTool === 'pen' ? styles.toolBtnOn : ''}`}
            onClick={() => onSetDrawTool('pen')}
            title="Pen"
          >
            🖊
          </button>
          <button
            className={`${styles.toolBtn} ${drawTool === 'eraser' ? styles.toolBtnOn : ''}`}
            onClick={() => onSetDrawTool('eraser')}
            title="Eraser"
          >
            🧽
          </button>
          <input
            className={styles.colorInput}
            type="color"
            value={color}
            onChange={(e) => onColor(e.target.value)}
            title="Stroke color"
          />
        </>
      )}

      <span className={styles.toolSep} />

      <button className={styles.toolBtn} onClick={onAddText} title="Add a text card">＋ Text</button>
      <button className={styles.toolBtn} onClick={onAddNote} title="Add a note card">＋ Note</button>
      <button className={styles.toolBtn} onClick={onAddMedia} title="Add an image / media file">＋ Media</button>
      <button className={styles.toolBtn} onClick={onAddWeb} title="Add a web page">＋ Web</button>

      <span className={styles.toolSep} />

      <button className={styles.toolBtn} onClick={() => onZoom(-1)} title="Zoom out">－</button>
      <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
      <button className={styles.toolBtn} onClick={() => onZoom(1)} title="Zoom in">＋</button>
      <button className={styles.toolBtn} onClick={onFit} title="Fit to content">⤢ Fit</button>
    </div>
  )
}
