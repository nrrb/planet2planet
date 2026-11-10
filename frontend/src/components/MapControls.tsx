import { bodies, bodyById } from '../model/catalog';
import type { Selection } from '../model/types';
import type { SelectionAction } from '../model/selection';
export const SPEEDS = [{ value: 1, label: 'Real Time' }, { value: 3600, label: '1 hour/s' }, { value: 86400, label: '1 day/s' }, { value: 864000, label: '10 days/s' }];

function BodyOptions({ exclude }: { exclude?: string | null }) {
  return <>{bodies.filter(b => !b.parentId || b.parentId === 'sun').map(body => <option key={body.id} value={body.id} disabled={body.id === exclude}>{body.name}</option>)}
    {bodies.filter(b => bodies.some(m => m.parentId === b.id) && b.id !== 'sun').map(parent => <optgroup key={parent.id} label={`${parent.name} moons`}>{bodies.filter(b => b.parentId === parent.id).map(body => <option key={body.id} value={body.id} disabled={body.id === exclude}>{body.name}</option>)}</optgroup>)}</>;
}
interface Props {
  playing: boolean; speed: number; time: number; tracks: boolean;
  selection: Selection; focusId: string;
  togglePlay: () => void; setSpeed: (speed: number) => void; now: () => void;
  setTracks: (tracks: boolean) => void; setFocus: (id: string) => void; focus: () => void;
  select: (action: SelectionAction) => void; preview: (id: string | null) => void;
}
export function MapControls(p: Props) {
  const selected = bodyById.get(p.selection.destination || p.selection.origin || p.focusId)!;
  const parent = selected.parentId ? bodyById.get(selected.parentId)!.name : 'System center';
  return <aside className="controls" aria-label="Map controls">
    <section className="control-section">
      <div className="section-heading"><span className="index">01</span><h2>Simulation clock</h2><span className="live-dot" data-playing={p.playing} /></div>
      <time className="clock" dateTime={new Date(p.time).toISOString()}>{new Date(p.time).toISOString().slice(0, 10)}<span>{new Date(p.time).toISOString().slice(11, 19)} <small>UTC</small></span></time>
      <div className="button-row"><button className="primary" onClick={p.togglePlay}>{p.playing ? 'Ⅱ Pause' : '▷ Play'}</button><button onClick={p.now}>Now ↗</button></div>
      <label className="field">Playback speed<select value={p.speed} onChange={e => p.setSpeed(Number(e.target.value))}>{SPEEDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
    </section>
    <section className="control-section">
      <div className="section-heading"><span className="index">02</span><h2>Find a world</h2></div>
      <label className="field">Body to focus<select value={p.focusId} onFocus={() => p.preview(p.focusId)} onBlur={() => p.preview(null)} onChange={e => { p.setFocus(e.target.value); p.preview(e.target.value); }}><BodyOptions /></select></label>
      <button className="wide" onClick={p.focus}>◎ Focus & follow</button>
      <label className="checkbox"><input type="checkbox" checked={p.tracks} onChange={e => p.setTracks(e.target.checked)} />Show orbit tracks</label>
    </section>
    <section className="control-section connection-controls">
      <div className="section-heading"><span className="index">03</span><h2>Make a connection</h2><span className="connection-symbol">↔</span></div>
      <label className="field">○ Origin<select value={p.selection.origin || ''} onFocus={() => p.preview(p.selection.origin)} onBlur={() => p.preview(null)} onChange={e => { p.select({ type: 'origin', id: e.target.value }); p.preview(e.target.value || null); }}><option value="">Choose an origin</option><BodyOptions /></select></label>
      <label className="field">□ Destination<select value={p.selection.destination || ''} disabled={!p.selection.origin} onFocus={() => p.preview(p.selection.destination)} onBlur={() => p.preview(null)} onChange={e => { p.select({ type: 'destination', id: e.target.value }); p.preview(e.target.value || null); }}><option value="">Choose a destination</option><BodyOptions exclude={p.selection.origin} /></select></label>
      <p className="selection-status" role="status">{p.selection.destination ? `${bodyById.get(p.selection.origin!)!.name} ↔ ${bodyById.get(p.selection.destination)!.name}` : p.selection.origin ? `${bodyById.get(p.selection.origin)!.name} selected. Choose a different destination.` : 'Select two worlds on the map or use the controls.'}</p>
      <button className="wide subtle" onClick={() => p.select({ type: 'clear' })} disabled={!p.selection.origin}>Clear connection <kbd>Esc</kbd></button>
    </section>
    <section className="body-details" aria-label="Selected body details"><span className="eyebrow">World in view</span><h2><span style={{ background: selected.color }} />{selected.name}</h2><dl><div><dt>Parent</dt><dd>{parent}</dd></div><div><dt>Mean radius</dt><dd>{selected.radiusKm.toLocaleString('en-US', { maximumFractionDigits: 2 })} km</dd></div></dl></section>
  </aside>;
}
