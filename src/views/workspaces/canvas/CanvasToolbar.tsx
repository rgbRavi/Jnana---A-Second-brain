// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import {
  ChevronDown,
  Eraser,
  Hand,
  ImageUp,
  Maximize,
  Minus,
  MousePointer2,
  Pen,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Settings,
  Undo2,
} from 'lucide-react'
import type { EraserMode } from './useCanvasPrefs'
import type { CanvasBackground } from '../../../core/canvas'
import { CANVAS_PALETTE } from './palette'
import styles from './canvas.module.css'

export type CanvasMode = 'select' | 'pan' | 'draw'
export type DrawTool = 'pen' | 'eraser'

interface Props {
  mode: CanvasMode
  onSetMode: (m: CanvasMode) => void
  drawTool: DrawTool
  onSetDrawTool: (t: DrawTool) => void
  color: string
  onColor: (c: string) => void
  penSize: number
  onPenSize: (s: number) => void
  eraserMode: EraserMode
  onEraserMode: (m: EraserMode) => void
  eraserSize: number
  onEraserSize: (s: number) => void
  interactWhileDrawing: boolean
  onInteractWhileDrawing: (v: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onAddText: () => void
  onAddNote: () => void
  onAddMedia: () => void
  onAddWeb: () => void
  scale: number
  onZoom: (dir: 1 | -1) => void
  onFit: () => void
  background?: CanvasBackground
  onSetBackgroundColor: (color: string) => void
  onUploadBackgroundImage: () => void
  onResetBackground: () => void
}

type PopoverKey = 'color' | 'size' | 'eraser' | 'settings'

export function CanvasToolbar({
  mode, onSetMode, drawTool, onSetDrawTool, color, onColor, penSize, onPenSize,
  eraserMode, onEraserMode, eraserSize, onEraserSize, interactWhileDrawing, onInteractWhileDrawing,
  canUndo, canRedo, onUndo, onRedo,
  onAddText, onAddNote, onAddMedia, onAddWeb, scale, onZoom, onFit,
  background, onSetBackgroundColor, onUploadBackgroundImage, onResetBackground,
}: Props) {
  const [openPopover, setOpenPopover] = useState<PopoverKey | null>(null)

  // Close any open popover on outside press / Escape — same pattern as CanvasContextMenu.
  useEffect(() => {
    if (!openPopover) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-popover]')) setOpenPopover(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPopover(null) }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [openPopover])

  const togglePopover = (key: PopoverKey) => setOpenPopover((cur) => (cur === key ? null : key))

  return (
    <div className={styles.toolbar}>
      <button className={styles.toolBtn} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} /></button>
      <button className={styles.toolBtn} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={16} /></button>

      <span className={styles.toolSep} />

      <button
        className={`${styles.toolBtn} ${mode === 'select' ? styles.toolBtnOn : ''}`}
        onClick={() => onSetMode('select')}
        title="Select / move (V)"
      >
        <MousePointer2 size={15} /> Select
      </button>
      <button
        className={`${styles.toolBtn} ${mode === 'pan' ? styles.toolBtnOn : ''}`}
        onClick={() => onSetMode('pan')}
        title="Pan (H)"
      >
        <Hand size={15} /> Pan
      </button>
      <button
        className={`${styles.toolBtn} ${mode === 'draw' ? styles.toolBtnOn : ''}`}
        onClick={() => onSetMode('draw')}
        title="Draw (D)"
      >
        <Pencil size={15} /> Draw
      </button>

      {mode === 'draw' && (
        <>
          <button
            className={`${styles.toolBtn} ${drawTool === 'pen' ? styles.toolBtnOn : ''}`}
            onClick={() => onSetDrawTool('pen')}
            title="Pen"
            aria-label="Pen"
          >
            <Pen size={15} />
          </button>
          <button
            className={`${styles.toolBtn} ${drawTool === 'eraser' ? styles.toolBtnOn : ''}`}
            onClick={() => onSetDrawTool('eraser')}
            title="Eraser"
            aria-label="Eraser"
          >
            <Eraser size={15} />
          </button>

          {drawTool === 'pen' && (
            <>
              <div className={styles.popoverWrap} data-popover>
                <button className={styles.toolBtn} onClick={() => togglePopover('color')} title="Stroke color">
                  <span className={styles.colorSwatchBtn} style={{ background: color }} />
                </button>
                {openPopover === 'color' && (
                  <div className={styles.popover} data-popover>
                    <div className={styles.swatchGrid}>
                      {CANVAS_PALETTE.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          className={`${styles.swatch} ${color === c.value ? styles.swatchOn : ''}`}
                          style={{ background: c.value }}
                          title={c.label}
                          onClick={() => onColor(c.value)}
                        />
                      ))}
                      <label className={`${styles.swatch} ${styles.swatchCustom}`} title="Custom color">
                        <input type="color" value={color} onChange={(e) => onColor(e.target.value)} />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.popoverWrap} data-popover>
                <button className={styles.toolBtn} onClick={() => togglePopover('size')} title="Pen size">
                  {penSize}px <ChevronDown size={13} />
                </button>
                {openPopover === 'size' && (
                  <div className={styles.popover} data-popover>
                    <label className={styles.popoverRow}>
                      <input
                        type="range"
                        min={2}
                        max={200}
                        value={penSize}
                        onChange={(e) => onPenSize(Number(e.target.value))}
                      />
                      <span className={styles.popoverValue}>{penSize}px</span>
                    </label>
                  </div>
                )}
              </div>
            </>
          )}

          {drawTool === 'eraser' && (
            <div className={styles.popoverWrap} data-popover>
              <button className={styles.toolBtn} onClick={() => togglePopover('eraser')} title="Eraser">
                {eraserMode === 'touch' ? 'Touch' : 'Stroke'} · {eraserSize}px <ChevronDown size={13} />
              </button>
              {openPopover === 'eraser' && (
                <div className={styles.popover} data-popover>
                  <label className={styles.popoverRow}>
                    <input
                      type="radio"
                      name="canvas-eraser-mode"
                      checked={eraserMode === 'touch'}
                      onChange={() => onEraserMode('touch')}
                    />
                    Touch — erases only what it passes over
                  </label>
                  <label className={styles.popoverRow}>
                    <input
                      type="radio"
                      name="canvas-eraser-mode"
                      checked={eraserMode === 'stroke'}
                      onChange={() => onEraserMode('stroke')}
                    />
                    Stroke — removes the whole stroke
                  </label>
                  <div className={styles.popoverSep} />
                  <label className={styles.popoverRow}>
                    <input
                      type="range"
                      min={8}
                      max={300}
                      value={eraserSize}
                      onChange={(e) => onEraserSize(Number(e.target.value))}
                    />
                    <span className={styles.popoverValue}>{eraserSize}px</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <span className={styles.toolSep} />

      <button className={styles.toolBtn} onClick={onAddText} title="Add a text card"><Plus size={15} /> Text</button>
      <button className={styles.toolBtn} onClick={onAddNote} title="Add a note card"><Plus size={15} /> Note</button>
      <button className={styles.toolBtn} onClick={onAddMedia} title="Add an image / media file"><Plus size={15} /> Media</button>
      <button className={styles.toolBtn} onClick={onAddWeb} title="Add a web page"><Plus size={15} /> Web</button>

      <span className={styles.toolSep} />

      <button className={styles.toolBtn} onClick={() => onZoom(-1)} title="Zoom out" aria-label="Zoom out"><Minus size={16} /></button>
      <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
      <button className={styles.toolBtn} onClick={() => onZoom(1)} title="Zoom in" aria-label="Zoom in"><Plus size={16} /></button>
      <button className={styles.toolBtn} onClick={onFit} title="Fit to content"><Maximize size={15} /> Fit</button>

      <span className={styles.toolSep} />

      <div className={styles.popoverWrap} data-popover>
        <button className={styles.toolBtn} onClick={() => togglePopover('settings')} title="Canvas settings" aria-label="Canvas settings"><Settings size={16} /></button>
        {openPopover === 'settings' && (
          <div className={styles.popover} data-popover>
            <label className={styles.popoverRow}>
              <input
                type="checkbox"
                checked={interactWhileDrawing}
                onChange={(e) => onInteractWhileDrawing(e.target.checked)}
              />
              Allow move &amp; resize while drawing
            </label>

            <div className={styles.popoverSep} />
            <div className={styles.popoverLabel}>Background</div>
            <div className={styles.swatchGrid}>
              {CANVAS_PALETTE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`${styles.swatch} ${background?.type === 'color' && background.value === c.value ? styles.swatchOn : ''}`}
                  style={{ background: c.value }}
                  title={c.label}
                  onClick={() => onSetBackgroundColor(c.value)}
                />
              ))}
              <label className={`${styles.swatch} ${styles.swatchCustom}`} title="Custom color">
                <input
                  type="color"
                  value={background?.type === 'color' ? background.value : '#1e1e2a'}
                  onChange={(e) => onSetBackgroundColor(e.target.value)}
                />
              </label>
            </div>
            <button className={styles.popoverBtn} onClick={onUploadBackgroundImage}><ImageUp size={15} /> Upload image…</button>
            <button className={styles.popoverBtn} onClick={onResetBackground} disabled={!background}>
              <RotateCcw size={15} /> Revert to original background
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
