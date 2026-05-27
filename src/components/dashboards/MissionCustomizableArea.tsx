/**
 * `MissionCustomizableArea` — wraps the Mission Control widget grid with
 * a lock toggle that switches between two render modes:
 *
 *   1. **Locked (default)** — renders the original `mission-grid` CSS
 *      grid as it always was. Pixel-identical to the pre-resize cockpit.
 *
 *   2. **Customizing** — renders the same widgets inside a
 *      `react-grid-layout` `GridLayout` so the operator can drag widgets
 *      around and pull on the bottom-right corner to resize. Layout
 *      state persists in `localStorage`. A `Reset` action restores
 *      defaults; a `Save preset` action writes immediately.
 *
 * The customization is purely positional. Widget content / props /
 * rendering are not modified by this component — it only assigns each
 * widget a position in the grid.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  clearLayout as clearStoredLayout,
  defaultLayout,
  isCustomized,
  readLayout,
  writeLayout,
} from '../../lib/missionLayout';

interface MissionCustomizableAreaProps {
  /** Each child must have a `key` matching one of the widget ids
   *  declared in `MISSION_WIDGETS`. The key is what RGL uses to index
   *  position/size in the layout. */
  children: ReactNode;
}

const ROW_HEIGHT = 30;
const COLS = 12;
const MARGIN: [number, number] = [12, 12];

export function MissionCustomizableArea({ children }: MissionCustomizableAreaProps) {
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [layout, setLayout] = useState<Layout[]>(() => readLayout());
  const [width, setWidth] = useState<number>(typeof window === 'undefined' ? 1600 : window.innerWidth - 320);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // Track the page width so the RGL grid resizes with the window.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const measure = () => setWidth(Math.max(800, window.innerWidth - 320));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (!savedToast) return undefined;
    const id = window.setTimeout(() => setSavedToast(null), 1900);
    return () => window.clearTimeout(id);
  }, [savedToast]);

  const onLayoutChange = useCallback((next: Layout[]) => {
    setLayout(next);
  }, []);

  const handleSave = useCallback(() => {
    writeLayout(layout);
    setSavedToast('layout saved');
  }, [layout]);

  const handleReset = useCallback(() => {
    setLayout(defaultLayout());
    clearStoredLayout();
    setSavedToast('layout restored to defaults');
  }, []);

  const customized = useMemo(() => isCustomized(layout), [layout]);

  return (
    <>
      <MissionCustomizeToolbar
        isCustomizing={isCustomizing}
        onToggle={() => setIsCustomizing((v) => !v)}
        onReset={handleReset}
        onSave={handleSave}
        customized={customized}
      />

      {/* Locked mode renders the original CSS grid — bit-identical to the
          pre-resize cockpit. Unlocked mode renders the same children
          inside a draggable / resizable react-grid-layout. */}
      {!isCustomizing ? (
        <div className="mission-grid">{children}</div>
      ) : (
        <div className="mission-grid mission-grid-customizing">
          <GridLayout
            className="mission-rgl"
            layout={layout}
            cols={COLS}
            rowHeight={ROW_HEIGHT}
            width={width}
            margin={MARGIN}
            isDraggable
            isResizable
            draggableHandle=".widget-title"
            resizeHandles={['se']}
            useCSSTransforms={false}
            onLayoutChange={onLayoutChange}
          >
            {children}
          </GridLayout>
        </div>
      )}

      {savedToast && (
        <div className="mission-customize-toast" role="status">{savedToast}</div>
      )}
    </>
  );
}

interface ToolbarProps {
  isCustomizing: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSave: () => void;
  customized: boolean;
}

function MissionCustomizeToolbar({ isCustomizing, onToggle, onReset, onSave, customized }: ToolbarProps) {
  return (
    <div className="mission-customize-bar" role="toolbar" aria-label="Mission Control layout controls">
      <button
        type="button"
        className={`mission-customize-toggle ${isCustomizing ? 'is-on' : ''}`}
        onClick={onToggle}
        aria-pressed={isCustomizing}
        title={isCustomizing ? 'Lock the layout' : 'Customize widget positions and sizes'}
      >
        <span className="dot" aria-hidden />
        {isCustomizing ? 'Lock layout' : 'Customize layout'}
        {customized && !isCustomizing && <em className="mission-customize-badge">custom</em>}
      </button>
      {isCustomizing && (
        <>
          <button
            type="button"
            className="mission-customize-action"
            onClick={onSave}
            title="Save the current arrangement to localStorage"
          >
            Save
          </button>
          <button
            type="button"
            className="mission-customize-action mission-customize-action-warn"
            onClick={onReset}
            title="Reset to the default arrangement"
          >
            Reset to default
          </button>
          <span className="mission-customize-hint">
            drag the widget header · pull the corner to resize
          </span>
        </>
      )}
    </div>
  );
}
