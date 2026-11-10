import { Application, Container, Graphics, Text } from 'pixi.js';
import { bodies, bodyById } from '../model/catalog';
import { positionsAt } from '../model/orbits';
import { bodyRadius, orbitRadius, SCALE } from '../model/scaling';
import { Camera } from '../model/camera';
import type { SimulationClock } from '../model/clock';
import type { Point, Selection } from '../model/types';

export interface SceneSettings {
  selection: Selection;
  tracks: boolean;
  focusPreview: string | null;
  effects: boolean;
}
interface Callbacks {
  read: () => SceneSettings;
  select: (id: string) => void;
  time: (time: number) => void;
  view: (following: string | null) => void;
}
interface Pointer { x: number; y: number }

export class SolarSystemScene {
  readonly camera = new Camera();
  private orbitLayer = new Container();
  private bodyLayer = new Container();
  private connectionLayer = new Graphics();
  private labelLayer = new Container();
  private disks = new Map<string, Graphics>();
  private tracks = new Map<string, Graphics>();
  private labels = new Map<string, Text>();
  private counts = new Map<string, Text>();
  private origins = new Map<string, Graphics>();
  private destinations = new Map<string, Graphics>();
  private positions: Map<string, Point>;
  private visible = new Set<string>();
  private observer: ResizeObserver | null = null;
  private pointers = new Map<number, Pointer>();
  private gestureStart: Point | null = null;
  private dragged = false;
  private hovered: string | null = null;
  private pair = '';
  private effectTime = 0;
  private connectionWasAnimated = false;
  private lastFrame = 0;
  private lastReport = 0;
  private mounted = false;
  private overviewRadius: number;

  private constructor(private app: Application, private clock: SimulationClock, private callbacks: Callbacks) {
    this.positions = positionsAt(bodies, clock.time);
    this.overviewRadius = Math.max(...bodies.filter(b => b.parentId === 'sun').map(b => {
      const extent = this.systemRadius(b.id);
      return orbitRadius(b, bodyById.get('sun')!) + extent;
    }));
    app.stage.addChild(this.orbitLayer, this.bodyLayer, this.connectionLayer, this.labelLayer);
    for (const body of bodies) {
      const r = bodyRadius(body.radiusKm);
      const disk = new Graphics().circle(0, 0, r).fill(body.color);
      this.disks.set(body.id, disk);
      this.bodyLayer.addChild(disk);
      if (body.parentId) {
        const track = new Graphics().circle(0, 0, orbitRadius(body, bodyById.get(body.parentId)!))
          .stroke({ color: 0xffffff, alpha: 0.5, width: 1, pixelLine: true });
        this.tracks.set(body.id, track);
        this.orbitLayer.addChild(track);
      }
      const label = new Text({ text: body.name, style: { fontFamily: 'monospace', fontSize: 12, fill: '#e8eee9' } });
      this.labels.set(body.id, label);
      const origin = new Graphics().circle(0, 0, r + 7).stroke({ color: '#ffbf64', width: 1.5 });
      const destination = new Graphics().rect(-r - 7, -r - 7, (r + 7) * 2, (r + 7) * 2).stroke({ color: '#ffbf64', width: 1.5 });
      this.origins.set(body.id, origin);
      this.destinations.set(body.id, destination);
      this.labelLayer.addChild(origin, destination, label);
      if (bodies.some(b => b.parentId === body.id)) {
        const count = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 10, fill: '#a6b6ac' } });
        this.counts.set(body.id, count);
        this.labelLayer.addChild(count);
      }
    }
  }

  static async create(clock: SimulationClock, callbacks: Callbacks) {
    const app = new Application();
    try {
      await app.init({ backgroundColor: '#000000', antialias: true, autoStart: false, preference: 'webgl', resolution: window.devicePixelRatio || 1, autoDensity: true });
      return new SolarSystemScene(app, clock, callbacks);
    } catch (error) {
      if (app.renderer) app.destroy(true, { children: true, texture: true, textureSource: true });
      else app.stage.destroy({ children: true });
      throw error;
    }
  }

  mount(host: HTMLElement) {
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.mounted = true;
    this.observer = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
      this.camera.width = width; this.camera.height = height;
    });
    this.observer.observe(host);
    // ResizeObserver runs after mount; set the first fit synchronously as well.
    const { width, height } = host.getBoundingClientRect();
    this.app.renderer.resize(width, height);
    this.camera.width = width; this.camera.height = height;
    this.camera.reset(this.overviewRadius);
    const canvas = this.app.canvas;
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    document.addEventListener('visibilitychange', this.visibility);
    this.app.ticker.add(this.frame);
    this.app.start();
  }

  private systemRadius(id: string): number {
    const parent = bodyById.get(id)!;
    return Math.max(bodyRadius(parent.radiusKm) + 24, ...bodies.filter(b => b.parentId === id).map(b => orbitRadius(b, parent) + bodyRadius(b.radiusKm) + 24));
  }
  focus(id: string) {
    const body = bodyById.get(id);
    if (!body) return;
    this.camera.following = id;
    const extent = body.parentId && body.parentId !== 'sun' ? this.systemRadius(body.parentId) * 2 : this.systemRadius(id);
    if (id === 'sun') this.camera.fit(this.overviewRadius);
    else this.camera.fit(extent);
    this.camera.follow(this.positions);
    this.callbacks.view(id);
  }
  reset() { this.camera.reset(this.overviewRadius); this.callbacks.view(null); }
  zoom(factor: number) { this.camera.zoomAt(factor, { x: this.camera.width / 2, y: this.camera.height / 2 }); }
  private visibility = () => { this.clock.rebase(); this.lastFrame = 0; };

  private frame = () => {
    const now = performance.now();
    const elapsed = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    const timestamp = this.clock.tick(now, document.hidden);
    const settings = this.callbacks.read();
    this.positions = positionsAt(bodies, timestamp);
    this.camera.follow(this.positions);
    const { zoom, x, y, width, height } = this.camera;
    for (const layer of [this.orbitLayer, this.bodyLayer]) {
      layer.scale.set(zoom, -zoom);
      layer.position.set(width / 2 - x * zoom, height / 2 + y * zoom);
    }
    this.orbitLayer.visible = settings.tracks;
    this.visible.clear();
    const focusedBody = this.camera.following ? bodyById.get(this.camera.following) : null;
    const focusedSystem = focusedBody?.parentId && focusedBody.parentId !== 'sun' ? focusedBody.parentId : focusedBody?.id;
    for (const body of bodies) {
      const p = this.positions.get(body.id)!;
      const s = this.camera.screen(p);
      const radius = bodyRadius(body.radiusKm);
      const moon = body.parentId !== null && body.parentId !== 'sun';
      const chosen = body.id === settings.selection.origin || body.id === settings.selection.destination;
      const show = !moon || chosen || body.id === settings.focusPreview || focusedSystem === body.parentId || (zoom >= 1.6 && radius * zoom >= 3);
      if (show) this.visible.add(body.id);
      const disk = this.disks.get(body.id)!;
      disk.visible = show; disk.position.set(p.x, p.y);
      const track = this.tracks.get(body.id);
      if (track) {
        const parent = this.positions.get(body.parentId!)!;
        track.position.set(parent.x, parent.y);
        track.visible = show;
      }
      const label = this.labels.get(body.id)!;
      label.visible = show;
      label.position.set(s.x + radius * zoom + 10, s.y - 7);
      for (const [highlight, enabled] of [[this.origins.get(body.id)!, body.id === settings.selection.origin], [this.destinations.get(body.id)!, body.id === settings.selection.destination]] as const) {
        highlight.visible = enabled;
        highlight.position.set(s.x, s.y);
        highlight.scale.set(zoom);
      }
    }
    for (const [id, count] of this.counts) {
      const hidden = bodies.filter(b => b.parentId === id && !this.visible.has(b.id)).length;
      const s = this.camera.screen(this.positions.get(id)!);
      count.visible = hidden > 0 && id !== 'sun';
      const text = `+${hidden} moon${hidden === 1 ? '' : 's'}`;
      if (count.text !== text) count.text = text;
      count.position.set(s.x + bodyRadius(bodyById.get(id)!.radiusKm) * zoom + 6, s.y + 10);
    }
    this.drawConnection(settings, elapsed);
    if (now - this.lastReport > 250) {
      this.lastReport = now;
      this.callbacks.time(timestamp);
    }
  };

  private drawConnection(settings: SceneSettings, elapsed: number) {
    const { origin, destination } = settings.selection;
    const pair = `${origin}/${destination}`;
    if (pair !== this.pair) {
      this.pair = pair; this.effectTime = 0;
      this.connectionWasAnimated = settings.effects && this.clock.playing;
    }
    const g = this.connectionLayer.clear();
    if (!origin || !destination) return;
    const animate = settings.effects && this.clock.playing && !document.hidden;
    if (animate && !this.connectionWasAnimated) {
      this.connectionWasAnimated = true;
      this.effectTime = SCALE.growSeconds;
    }
    if (animate) this.effectTime += elapsed;
    const a = this.camera.screen(this.positions.get(origin)!);
    const b = this.camera.screen(this.positions.get(destination)!);
    const t = settings.effects && this.connectionWasAnimated ? Math.min(1, this.effectTime / SCALE.growSeconds) : 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    g.moveTo(a.x, a.y).lineTo(a.x + dx * t, a.y + dy * t).stroke({ color: '#ffb95e', width: 1.5, alpha: 0.85 });
    const angle = Math.atan2(dy, dx);
    const endX = a.x + dx * t, endY = a.y + dy * t;
    g.moveTo(endX - 9 * Math.cos(angle - 0.45), endY - 9 * Math.sin(angle - 0.45)).lineTo(endX, endY)
      .lineTo(endX - 9 * Math.cos(angle + 0.45), endY - 9 * Math.sin(angle + 0.45)).stroke({ color: '#ffb95e', width: 1.5 });
    g.moveTo(a.x + 9 * Math.cos(angle - 0.45), a.y + 9 * Math.sin(angle - 0.45)).lineTo(a.x, a.y)
      .lineTo(a.x + 9 * Math.cos(angle + 0.45), a.y + 9 * Math.sin(angle + 0.45)).stroke({ color: '#ffb95e', width: 1.5 });
    if (settings.effects && this.connectionWasAnimated && t === 1) {
      for (let i = 0; i < 3; i++) {
        const phase = ((this.effectTime - SCALE.growSeconds) / SCALE.pulseSeconds + i / 3) % 1;
        const offsetX = -Math.sin(angle) * 4, offsetY = Math.cos(angle) * 4;
        g.circle(a.x + dx * phase + offsetX, a.y + dy * phase + offsetY, 3).fill('#ffcd87');
        g.circle(b.x - dx * phase - offsetX, b.y - dy * phase - offsetY, 3).fill('#ffcd87');
      }
    }
  }

  private local(event: { clientX: number; clientY: number }): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private hit(point: Point): string | null {
    let match: string | null = null, best = Infinity;
    for (const body of bodies) {
      if (!this.visible.has(body.id)) continue;
      const s = this.camera.screen(this.positions.get(body.id)!);
      const distance = Math.hypot(point.x - s.x, point.y - s.y);
      if (distance <= Math.max(11, bodyRadius(body.radiusKm) * this.camera.zoom) && distance < best) { best = distance; match = body.id; }
    }
    return match;
  }
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const p = this.local(event);
    this.pointers.set(event.pointerId, p);
    this.app.canvas.setPointerCapture(event.pointerId);
    if (this.pointers.size === 1) { this.gestureStart = p; this.dragged = false; }
    else this.dragged = true;
  };
  private pointerMove = (event: PointerEvent) => {
    const p = this.local(event);
    const previous = this.pointers.get(event.pointerId);
    if (!previous) {
      this.hovered = this.hit(p);
      this.app.canvas.style.cursor = this.hovered ? 'pointer' : 'grab';
      return;
    }
    if (this.pointers.size >= 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)![1];
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      if (before > 0 && after > 0) this.camera.zoomAt(after / before, { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 });
      this.dragged = true;
    } else {
      if (this.gestureStart && Math.hypot(p.x - this.gestureStart.x, p.y - this.gestureStart.y) > 5) this.dragged = true;
      if (this.dragged) {
        this.camera.pan(p.x - previous.x, p.y - previous.y);
        this.callbacks.view(null);
        this.app.canvas.style.cursor = 'grabbing';
      }
    }
    this.pointers.set(event.pointerId, p);
  };
  private pointerUp = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    const id = !this.dragged && this.pointers.size === 1 ? this.hit(this.local(event)) : null;
    this.releasePointer(event);
    if (id) this.callbacks.select(id);
  };
  private releasePointer(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    if (this.app.canvas.hasPointerCapture(event.pointerId)) this.app.canvas.releasePointerCapture(event.pointerId);
    if (!this.pointers.size) this.gestureStart = null;
    this.app.canvas.style.cursor = 'grab';
  }
  private pointerCancel = (event: PointerEvent) => { this.dragged = true; this.releasePointer(event); };
  private pointerLeave = () => { this.hovered = null; };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.camera.height : 1);
    this.camera.zoomAt(Math.exp(-delta * 0.002), this.local(event));
  };
  destroy() {
    this.observer?.disconnect();
    if (this.mounted) {
      const canvas = this.app.canvas;
      canvas.removeEventListener('pointerdown', this.pointerDown);
      canvas.removeEventListener('pointermove', this.pointerMove);
      canvas.removeEventListener('pointerup', this.pointerUp);
      canvas.removeEventListener('pointercancel', this.pointerCancel);
      canvas.removeEventListener('pointerleave', this.pointerLeave);
      canvas.removeEventListener('wheel', this.wheel);
      document.removeEventListener('visibilitychange', this.visibility);
      this.app.ticker.remove(this.frame);
    }
    this.app.destroy(true, { children: true, texture: true, textureSource: true });
  }
}
