import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../ui/useReducedMotion';
import { useSiteTheme } from '../ui/useSiteTheme';
import type { MapModel, RenderLink } from './adapter';
import type { Hover, NetworkScene, WorldMark } from './NetworkScene';
import { LAYER_ORDER, LAYER_STYLES, layerColor, MAP_COLORS, type MapTheme } from './palette';
import styles from './MapView.module.css';

interface Props {
  model: MapModel;
  links: readonly RenderLink[];
  highlighted: ReadonlySet<string>;
  dimOthers: boolean;
  labelPlanets: boolean;
  /** Node ids to frame on first show and on "Reset view". Null frames the whole system. */
  fitNodes: readonly string[] | null;
  /** Names the map for assistive technology. */
  label: string;
  /** Origin and destination markers, drawn without any route. */
  markers?: ReadonlyMap<string, 'from' | 'to'>;
  /** Show every moon at overview zoom. */
  showAllMoons?: boolean;
  /** The history map's per-world state. */
  marks?: ReadonlyMap<string, WorldMark>;
  /** Height of the map frame; defaults to a tall panel for dialogs. */
  compact?: boolean;
  /** Just the picture, filling its parent: no controls, legend or border. For the share image. */
  bare?: boolean;
}

const SITE_TIME = Date.UTC(2380, 5, 9, 12);

/** Layer colours and line styles, shown for the layers actually drawn. */
export function Legend({ layers, theme }: { layers: readonly string[]; theme: MapTheme }) {
  const shown = LAYER_ORDER.filter((layer) => layers.includes(layer));
  return (
    <ul className={styles.legend} aria-label="Map legend">
      {shown.map((layer) => {
        const style = LAYER_STYLES[layer];
        const dash = style.dash ? (style.dash[0] <= 3 ? 'dotted' : 'dashed') : 'solid';
        return (
          <li key={layer}>
            <span
              className={styles.swatch}
              style={{
                color: layerColor(theme, layer),
                borderTopStyle: dash,
                borderTopWidth: Math.round(style.width) + 1,
              }}
              aria-hidden="true"
            />
            {style.label}
          </li>
        );
      })}
    </ul>
  );
}

function tooltipText(hover: Hover): { title: string; lines: string[] } {
  if (hover.kind === 'body') return { title: hover.name, lines: [] };
  const { carrier, layer, lengthKm, latencyShare } = hover.info;
  const lines = [layer];
  if (lengthKm !== null) lines.push(`${lengthKm.toLocaleString('en-US')} km`);
  if (latencyShare !== null) lines.push(`${Math.round(latencyShare * 100)}% of the route's latency`);
  return { title: carrier, lines };
}

/** The animated map. Loaded lazily, since it carries the whole rendering library. */
export default function MapView({
  model,
  links,
  highlighted,
  dimOthers,
  labelPlanets,
  fitNodes,
  label,
  markers,
  showAllMoons,
  marks,
  compact,
  bare,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<NetworkScene | null>(null);
  const reduced = useReducedMotion();
  const theme = useSiteTheme();
  const themeAtCreation = useRef(theme);
  useEffect(() => {
    themeAtCreation.current = theme;
  });
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [hover, setHover] = useState<Hover | null>(null);
  const animate = !reduced && !paused;

  // Create the scene once per model.
  useEffect(() => {
    let disposed = false;
    let created: NetworkScene | null = null;
    void import('./NetworkScene')
      .then(({ NetworkScene }) =>
        NetworkScene.create(
          { bodies: model.bodies, orbits: model.orbits, nodes: model.nodes, startTime: SITE_TIME },
          { onHover: setHover },
          themeAtCreation.current,
        ),
      )
      .then((instance) => {
        if (disposed || !host.current) {
          instance.destroy();
          return;
        }
        created = instance;
        scene.current = instance;
        instance.mount(host.current);
        setStatus('ready');
      })
      .catch(() => {
        if (!disposed) setStatus('failed');
      });
    return () => {
      disposed = true;
      scene.current = null;
      created?.destroy();
    };
  }, [model]);

  // Follow the site theme without rebuilding the scene.
  useEffect(() => {
    scene.current?.setTheme(theme);
  }, [theme, status]);

  useEffect(() => {
    scene.current?.setState({ links, highlighted, dimOthers, labelPlanets, animate, markers, showAllMoons, marks });
  }, [links, highlighted, dimOthers, labelPlanets, animate, markers, showAllMoons, marks, status]);

  const fitKey = fitNodes ? fitNodes.join(',') : '';
  useEffect(() => {
    scene.current?.fitTo(fitNodes && fitNodes.length ? fitNodes : null);
    // fitKey stands in for fitNodes, which is a new array on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, status]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const s = scene.current;
    if (!s) return;
    const step = 40;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => s.pan(step, 0),
      ArrowRight: () => s.pan(-step, 0),
      ArrowUp: () => s.pan(0, step),
      ArrowDown: () => s.pan(0, -step),
      '+': () => s.zoom(1.3),
      '=': () => s.zoom(1.3),
      '-': () => s.zoom(1 / 1.3),
      '0': () => s.fitTo(fitNodes && fitNodes.length ? fitNodes : null),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  const tip = hover ? tooltipText(hover) : null;
  return (
    <div className={`${styles.frame} ${bare ? styles.frameBare : ''}`}>
      {/* A custom widget: the canvas has no native keyboard behaviour, so the wrapper handles keys. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        ref={host}
        className={`${styles.canvasWrap} ${compact ? styles.compact : ''} ${bare ? styles.bare : ''}`}
        style={{ background: MAP_COLORS[theme].background }}
        tabIndex={0}
        role="application"
        aria-label={`${label}. Arrow keys pan, plus and minus zoom, zero resets the view.`}
        onKeyDown={onKeyDown}
      >
        {status === 'loading' && <p className={styles.message}>Preparing the map…</p>}
        {status === 'failed' && (
          <p className={styles.message} role="status">
            The map could not start in this browser. The route is listed below.
          </p>
        )}
        {tip && hover && (
          <div
            className={styles.tooltip}
            style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12 }}
            role="status"
          >
            <strong>{tip.title}</strong>
            {tip.lines.map((line) => (
              <span key={line} style={{ display: 'block' }}>
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      {!bare && (
        <div className={`${styles.controls} ${compact ? styles.overlay : ''}`}>
          <button
            type="button"
            className={styles.control}
            onClick={() => scene.current?.zoom(1.4)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={() => scene.current?.zoom(1 / 1.4)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={() => scene.current?.fitTo(fitNodes && fitNodes.length ? fitNodes : null)}
          >
            Reset view
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={() => setPaused((p) => !p)}
            disabled={reduced}
            aria-pressed={paused}
          >
            {paused || reduced ? 'Play motion' : 'Pause motion'}
          </button>
          {reduced && !compact && (
            <span className={styles.hint}>Motion is off because your system asks for reduced motion.</span>
          )}
        </div>
      )}
      {!bare && links.length > 0 && (
        <Legend theme={theme} layers={[...new Set(links.filter((l) => l.emphasis !== 'dim').map((l) => l.layer))]} />
      )}
    </div>
  );
}
