import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { MapModel, RenderLink } from './adapter';
import type { Hover, NetworkScene } from './NetworkScene';
import { LAYER_ORDER, LAYER_STYLES } from './palette';
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
}

const SITE_TIME = Date.UTC(2380, 5, 9, 12);

/** Layer colours and line styles, shown for the layers actually drawn. */
export function Legend({ layers }: { layers: readonly string[] }) {
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
              style={{ color: style.color, borderTopStyle: dash, borderTopWidth: Math.round(style.width) + 1 }}
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
export default function MapView({ model, links, highlighted, dimOthers, labelPlanets, fitNodes, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<NetworkScene | null>(null);
  const reduced = useReducedMotion();
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

  useEffect(() => {
    scene.current?.setState({ links, highlighted, dimOthers, labelPlanets, animate });
  }, [links, highlighted, dimOthers, labelPlanets, animate, status]);

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
    <div className={styles.frame}>
      {/* A custom widget: the canvas has no native keyboard behaviour, so the wrapper handles keys. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        ref={host}
        className={styles.canvasWrap}
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
      <div className={styles.controls}>
        <button type="button" className={styles.control} onClick={() => scene.current?.zoom(1.4)} aria-label="Zoom in">
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
        {reduced && <span className={styles.hint}>Motion is off because your system asks for reduced motion.</span>}
      </div>
      <Legend layers={[...new Set(links.filter((l) => l.emphasis !== 'dim').map((l) => l.layer))]} />
    </div>
  );
}
