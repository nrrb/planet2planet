import { useEffect, useReducer, useRef, useState } from 'react';
import { MapControls, SPEEDS } from './MapControls';
import { catalog, bodyById } from '../model/catalog';
import { SimulationClock } from '../model/clock';
import { EMPTY, select } from '../model/selection';
import { SCALE } from '../model/scaling';
import { SolarSystemScene, type SceneSettings } from '../rendering/SolarSystemScene';

export function SolarSystemMap({ defaultSpeed = SCALE.defaultSpeed }: { defaultSpeed?: number }) {
  const [clock] = useState(
    () => new SimulationClock(Date.now(), defaultSpeed, !window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const [playing, setPlaying] = useState(clock.playing);
  const [speed, setSpeed] = useState(clock.speed);
  const [time, setTime] = useState(clock.time);
  const [tracks, setTracks] = useState(true);
  const [selection, dispatch] = useReducer(select, EMPTY);
  const [focusId, setFocusId] = useState('earth');
  const [following, setFollowing] = useState<string | null>(null);
  const [focusPreview, setFocusPreview] = useState<string | null>(null);
  const [effects, setEffects] = useState(clock.playing);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SolarSystemScene | null>(null);
  const current = useRef<SceneSettings>({ selection, tracks, focusPreview, effects });
  current.current = { selection, tracks, focusPreview, effects };

  useEffect(() => {
    let disposed = false;
    let instance: SolarSystemScene | null = null;
    clock.rebase();
    SolarSystemScene.create(clock, {
      read: () => current.current,
      select: (id) => dispatch({ type: 'click', id }),
      time: setTime,
      view: setFollowing,
    })
      .then((created) => {
        if (disposed) {
          created.destroy();
          return;
        }
        instance = created;
        scene.current = created;
        created.mount(host.current!);
        setError('');
        setReady(true);
      })
      .catch((reason) => {
        if (!disposed)
          setError(
            `Unable to start the map. ${reason instanceof Error ? reason.message : 'Please reload and try again.'}`,
          );
      });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'clear' });
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => {
      if (media.matches) {
        clock.tick(performance.now(), document.hidden);
        clock.playing = false;
        setPlaying(false);
        setEffects(false);
      }
    };
    document.addEventListener('keydown', escape);
    media.addEventListener('change', reduced);
    return () => {
      disposed = true;
      instance?.destroy();
      scene.current = null;
      clock.rebase();
      document.removeEventListener('keydown', escape);
      media.removeEventListener('change', reduced);
    };
  }, [clock]);

  function togglePlay() {
    clock.tick(performance.now(), document.hidden);
    clock.playing = !clock.playing;
    clock.rebase();
    setPlaying(clock.playing);
    if (clock.playing) setEffects(true);
  }
  function changeSpeed(value: number) {
    clock.tick(performance.now(), document.hidden);
    clock.speed = value;
    setSpeed(value);
  }
  function now() {
    clock.time = Date.now();
    clock.rebase();
    setTime(clock.time);
  }

  return (
    <div className="solar-system-map">
      <div className="map-column">
        <div
          className="map-surface"
          aria-label="Interactive solar system; use the adjacent selectors for keyboard access"
        >
          <div ref={host} className="canvas-host" />
          <div className="map-topline">
            <span className="eyebrow">SOL / SYSTEM MAP</span>
            <span className="map-mode" role="status">
              {following ? `Following ${bodyById.get(following)!.name}` : 'Solar overview'}
            </span>
          </div>
          {!ready && !error && (
            <p className="map-message" role="status">
              Preparing the solar system…
            </p>
          )}
          {error && (
            <p className="map-message error" role="alert">
              {error}
            </p>
          )}
          <div className="map-bottomline">
            <span className="map-hint">Drag to pan · Scroll or pinch to zoom</span>
            <div className="camera-controls">
              <button aria-label="Zoom out" onClick={() => scene.current?.zoom(1 / 1.4)} disabled={!ready}>
                −
              </button>
              <button aria-label="Zoom in" onClick={() => scene.current?.zoom(1.4)} disabled={!ready}>
                +
              </button>
              <button onClick={() => scene.current?.reset()} disabled={!ready}>
                Reset view ↗
              </button>
            </div>
          </div>
        </div>
        <div className="map-caption">
          <span>
            <i className="key-line" /> Schematic orbital tracks
          </span>
          <span>
            {playing ? 'Running' : 'Paused'} · {SPEEDS.find((s) => s.value === speed)?.label || `${speed} seconds/s`}
          </span>
        </div>
        <p className="accuracy-note">
          Sizes and distances are compressed; positions are approximate.
          {catalog.referenceKind === 'illustrative' && <strong> Positions are illustrative approximations.</strong>}
        </p>
      </div>
      <MapControls
        playing={playing}
        speed={speed}
        time={time}
        tracks={tracks}
        selection={selection}
        focusId={focusId}
        togglePlay={togglePlay}
        setSpeed={changeSpeed}
        now={now}
        setTracks={setTracks}
        setFocus={setFocusId}
        focus={() => scene.current?.focus(focusId)}
        select={dispatch}
        preview={setFocusPreview}
      />
    </div>
  );
}
