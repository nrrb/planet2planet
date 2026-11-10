import { Application, Container, Graphics, Text } from 'pixi.js';
import type { NetworkNode } from '../api/types';
import { Camera } from '../model/camera';
import { bodyRadius } from '../model/scaling';
import type { Point } from '../model/types';
import type { LinkInfo, RenderLink } from './adapter';
import type { Orbits } from './kepler';
import {
  displayPositions,
  lunarRadius,
  type MapBody,
  orbitTrack,
  relayPosition,
  SUN_RADIUS_KM,
  systemRadius,
} from './layout';
import { AU_KM, daysSinceJ2000, moonOffset } from './kepler';
import { bodyColor, LAYER_STYLES, MAP_ACCENT, MAP_BACKGROUND, MAP_MUTED, MAP_TEXT } from './palette';

export interface SceneState {
  links: readonly RenderLink[];
  /** Worlds drawn in full colour, labelled and pulsing. */
  highlighted: ReadonlySet<string>;
  /** Draw every other world faint, without a label, until hovered. */
  dimOthers: boolean;
  /** Label every planet (the network map) or only highlighted and hovered worlds. */
  labelPlanets: boolean;
  /** Flow animation. Off for reduced motion or when paused. */
  animate: boolean;
}

export type Hover =
  | { kind: 'link'; info: LinkInfo; x: number; y: number }
  | { kind: 'body'; id: string; name: string; x: number; y: number };

export interface SceneCallbacks {
  onHover: (hover: Hover | null) => void;
}

interface SceneInput {
  bodies: readonly MapBody[];
  orbits: Orbits;
  nodes: ReadonlyMap<string, NetworkNode>;
  startTime: number;
}

const DAY_SECONDS_PER_REAL = 86_400; // one simulated day per second
const FLOW_PX_PER_SECOND = 40;
const FLOW_DASH = 7;
const FLOW_GAP = 25;

const hex = (color: string) => parseInt(color.slice(1), 16);

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export class NetworkScene {
  readonly camera = new Camera();
  private orbitLayer = new Container();
  private bodyLayer = new Container();
  private overlay = new Graphics();
  private labelLayer = new Container();
  private disks = new Map<string, Graphics>();
  private moonTracks = new Map<string, Graphics>();
  private labels = new Map<string, Text>();
  private sunLabel: Text;
  private positions = new Map<string, Point>();
  private screenLinks: { link: RenderLink; a: Point; b: Point }[] = [];
  private state: SceneState = {
    links: [],
    highlighted: new Set(),
    dimOthers: false,
    labelPlanets: true,
    animate: false,
  };
  private time: number;
  private flowClock = 0;
  private lastFrame = 0;
  private hovered: string | null = null;
  private observer: ResizeObserver | null = null;
  private pointers = new Map<number, Point>();
  private gestureStart: Point | null = null;
  private dragged = false;
  private mounted = false;
  private overview: number;
  private fitPoints: Point[] | null = null;

  private constructor(
    private app: Application,
    private input: SceneInput,
    private callbacks: SceneCallbacks,
  ) {
    this.time = input.startTime;
    this.overview = systemRadius(input.bodies, input.orbits) + 40;
    app.stage.addChild(this.orbitLayer, this.bodyLayer, this.overlay, this.labelLayer);

    const sun = new Graphics().circle(0, 0, bodyRadius(SUN_RADIUS_KM)).fill(hex(bodyColor('sun')));
    this.bodyLayer.addChild(sun);
    this.sunLabel = this.makeLabel('Sun', MAP_MUTED);

    for (const body of input.bodies) {
      const orbit = input.orbits[body.id];
      const disk = new Graphics().circle(0, 0, bodyRadius(body.radiusKm)).fill(hex(bodyColor(body.id)));
      this.disks.set(body.id, disk);
      this.bodyLayer.addChild(disk);
      if (orbit.kind === 'moon') {
        const parent = input.bodies.find((b) => b.id === body.parent);
        const days = daysSinceJ2000(input.startTime);
        const offset = moonOffset(orbit, days);
        const radius = lunarRadius(parent?.radiusKm ?? 0, Math.hypot(offset.x, offset.y) * AU_KM);
        const track = new Graphics()
          .circle(0, 0, radius)
          .stroke({ color: 0xffffff, alpha: 0.18, width: 1, pixelLine: true });
        this.moonTracks.set(body.id, track);
        this.orbitLayer.addChild(track);
      } else {
        const track = new Graphics();
        const points = orbitTrack(orbit);
        track
          .poly(
            points.flatMap((p) => [p.x, p.y]),
            true,
          )
          .stroke({ color: 0xffffff, alpha: 0.22, width: 1, pixelLine: true });
        this.orbitLayer.addChild(track);
      }
      this.labels.set(body.id, this.makeLabel(body.name, MAP_TEXT));
    }
  }

  private makeLabel(text: string, fill: string): Text {
    const label = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill } });
    this.labelLayer.addChild(label);
    return label;
  }

  static async create(input: SceneInput, callbacks: SceneCallbacks): Promise<NetworkScene> {
    const app = new Application();
    try {
      await app.init({
        backgroundColor: MAP_BACKGROUND,
        antialias: true,
        autoStart: false,
        preference: 'webgl',
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      return new NetworkScene(app, input, callbacks);
    } catch (error) {
      if (app.renderer) app.destroy(true, { children: true, texture: true, textureSource: true });
      throw error;
    }
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.app.canvas.style.touchAction = 'none';
    this.mounted = true;
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
      this.camera.width = Math.max(1, width);
      this.camera.height = Math.max(1, height);
    };
    this.observer = new ResizeObserver(resize);
    this.observer.observe(host);
    resize();
    this.reset();
    const canvas = this.app.canvas;
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    this.app.ticker.add(this.frame);
    this.app.start();
  }

  setState(state: SceneState): void {
    this.state = state;
  }

  /** Frame the given worlds and nodes; with none, the whole system. */
  fitTo(nodeIds: readonly string[] | null): void {
    if (!nodeIds || nodeIds.length === 0) {
      this.fitPoints = null;
    } else {
      this.positions = displayPositions(this.input.bodies, this.input.orbits, this.time);
      const pts = nodeIds.map((id) => this.nodePoint(id)).filter((p): p is Point => p !== null);
      this.fitPoints = pts.length ? pts : null;
    }
    this.reset();
  }

  reset(): void {
    this.camera.following = null;
    if (!this.fitPoints) {
      this.camera.x = 0;
      this.camera.y = 0;
      this.camera.fit(this.overview * 0.8);
      return;
    }
    const xs = this.fitPoints.map((p) => p.x);
    const ys = this.fitPoints.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const radius = Math.max(60, ...this.fitPoints.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 40;
    this.camera.x = cx;
    this.camera.y = cy;
    this.camera.fit(radius);
  }

  zoom(factor: number): void {
    this.camera.zoomAt(factor, { x: this.camera.width / 2, y: this.camera.height / 2 });
  }

  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
  }

  private nodePoint(id: string): Point | null {
    const node = this.input.nodes.get(id);
    if (!node) return null;
    if (node.kind === 'relay') return node.fixedPosition ? relayPosition(node.fixedPosition) : null;
    return node.world ? (this.positions.get(node.world) ?? null) : null;
  }

  private frame = (): void => {
    const now = performance.now();
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : 0;
    this.lastFrame = now;
    const { animate } = this.state;
    if (animate) {
      this.time += dt * DAY_SECONDS_PER_REAL * 1000;
      this.flowClock += dt;
    }
    this.positions = displayPositions(this.input.bodies, this.input.orbits, this.time);
    this.draw(this.flowClock);
  };

  private draw(flowClock: number): void {
    const { zoom, x, y, width, height } = this.camera;
    for (const layer of [this.orbitLayer, this.bodyLayer]) {
      layer.scale.set(zoom, -zoom);
      layer.position.set(width / 2 - x * zoom, height / 2 + y * zoom);
    }
    const { highlighted, dimOthers, labelPlanets, animate } = this.state;
    const sunScreen = this.camera.screen({ x: 0, y: 0 });
    this.sunLabel.position.set(sunScreen.x + bodyRadius(SUN_RADIUS_KM) * zoom + 6, sunScreen.y - 7);
    this.sunLabel.visible = zoom >= 0.3;

    const linked = new Set<string>();
    for (const link of this.state.links) {
      if (link.emphasis === 'dim') continue;
      for (const id of [link.from, link.to]) {
        const world = this.input.nodes.get(id)?.world;
        if (world) linked.add(world);
      }
    }

    for (const body of this.input.bodies) {
      const p = this.positions.get(body.id);
      if (!p) continue;
      const moon = body.parent !== null;
      const chosen = highlighted.has(body.id);
      const emphasised = chosen || linked.has(body.id) || body.id === this.hovered;
      const showMoon = !moon || emphasised || zoom >= 1.6;
      const disk = this.disks.get(body.id);
      if (disk) {
        disk.visible = showMoon;
        disk.position.set(p.x, p.y);
        disk.alpha = dimOthers && !emphasised ? 0.3 : 1;
      }
      const track = this.moonTracks.get(body.id);
      const parent = body.parent ? this.positions.get(body.parent) : null;
      if (track && parent) {
        track.position.set(parent.x, parent.y);
        track.visible = showMoon;
      }
      const s = this.camera.screen(p);
      const label = this.labels.get(body.id);
      if (label) {
        const wanted =
          chosen || body.id === this.hovered || (labelPlanets && !moon) || (labelPlanets && moon && zoom >= 2.2);
        label.visible = showMoon && wanted;
        label.alpha = dimOthers && !chosen && body.id !== this.hovered ? 0.8 : 1;
        label.position.set(s.x + bodyRadius(body.radiusKm) * zoom + 7, s.y - 7);
      }
    }

    const g = this.overlay.clear();
    // Highlight rings.
    for (const id of highlighted) {
      const body = this.input.bodies.find((b) => b.id === id);
      const p = this.positions.get(id);
      if (!body || !p) continue;
      const s = this.camera.screen(p);
      const base = bodyRadius(body.radiusKm) * zoom + 6;
      const pulse = animate ? 1 + 0.18 * Math.sin(flowClock * 3) : 1;
      g.circle(s.x, s.y, base * pulse).stroke({ color: hex(MAP_ACCENT), width: 2, alpha: 0.9 });
    }
    this.drawLinks(g, flowClock);
  }

  private drawLinks(g: Graphics, flowClock: number): void {
    this.screenLinks = [];
    const { animate } = this.state;
    const order = { dim: 0, context: 1, route: 2 } as const;
    const links = [...this.state.links].sort((l, r) => order[l.emphasis] - order[r.emphasis]);
    // Several carriers own links between the same two nodes. Fan them out sideways so each
    // can be seen instead of drawing on top of one another.
    const pairKey = (l: RenderLink) => (l.from < l.to ? `${l.from}|${l.to}` : `${l.to}|${l.from}`);
    const groups = new Map<string, RenderLink[]>();
    for (const link of links) {
      if (link.emphasis === 'dim') continue;
      const key = pairKey(link);
      groups.set(key, [...(groups.get(key) ?? []), link]);
    }
    for (const link of links) {
      const pa = this.nodePoint(link.from);
      const pb = this.nodePoint(link.to);
      if (!pa || !pb) continue;
      let a = this.camera.screen(pa);
      let b = this.camera.screen(pb);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 1) continue;
      const group = link.emphasis === 'dim' ? undefined : groups.get(pairKey(link));
      if (group && group.length > 1) {
        const index = group.indexOf(link);
        // Offset from the canonical direction so links stored a to b and b to a stay together.
        const sign = link.from < link.to ? 1 : -1;
        const shift = (index - (group.length - 1) / 2) * 4 * sign;
        const nx = (-(b.y - a.y) / length) * shift;
        const ny = ((b.x - a.x) / length) * shift;
        a = { x: a.x + nx, y: a.y + ny };
        b = { x: b.x + nx, y: b.y + ny };
      }
      this.screenLinks.push({ link, a, b });
      const style = LAYER_STYLES[link.layer] ?? LAYER_STYLES.mesh;
      const color = hex(style.color);
      if (link.emphasis === 'dim') {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width: 1, alpha: 0.07 });
        continue;
      }
      if (link.emphasis === 'context') {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width: 1, alpha: 0.3 });
        continue;
      }
      // Base line: solid or in the layer's dash pattern, so layers differ without colour.
      this.strokePattern(g, a, b, length, style.dash, 0, color, style.width, 0.8);
      // Traffic: short bright dashes that travel from `from` to `to` while animating, and a
      // chevron at the midpoint that shows the direction when they are not moving.
      if (animate) {
        const offset = (flowClock * FLOW_PX_PER_SECOND) % (FLOW_DASH + FLOW_GAP);
        this.strokePattern(g, a, b, length, [FLOW_DASH, FLOW_GAP], offset, 0xffffff, style.width, 0.85);
      } else if (length > 24) {
        this.chevron(g, a, b, length, color);
      }
    }
  }

  private strokePattern(
    g: Graphics,
    a: Point,
    b: Point,
    length: number,
    dash: [number, number] | null,
    offset: number,
    color: number,
    width: number,
    alpha: number,
  ): void {
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    if (!dash) {
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width, alpha });
      return;
    }
    const [d, gap] = dash;
    const period = d + gap;
    const step = Math.max(period, length / 400); // cap work on very long links
    for (let t = offset - period; t < length; t += step) {
      const start = Math.max(0, t);
      const end = Math.min(length, t + d);
      if (end <= start) continue;
      g.moveTo(a.x + ux * start, a.y + uy * start).lineTo(a.x + ux * end, a.y + uy * end);
    }
    g.stroke({ color, width, alpha });
  }

  private chevron(g: Graphics, a: Point, b: Point, length: number, color: number): void {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const size = 7;
    g.moveTo(mx - ux * size - uy * size * 0.7, my - uy * size + ux * size * 0.7)
      .lineTo(mx + ux * size, my + uy * size)
      .lineTo(mx - ux * size + uy * size * 0.7, my - uy * size - ux * size * 0.7)
      .stroke({ color, width: 2, alpha: 0.95 });
  }

  // Input ---------------------------------------------------------------------------------

  private local(event: { clientX: number; clientY: number }): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private hitBody(point: Point): string | null {
    let match: string | null = null;
    let best = Infinity;
    for (const body of this.input.bodies) {
      const p = this.positions.get(body.id);
      if (!p || (body.parent && this.camera.zoom < 1.6 && !this.state.highlighted.has(body.id))) continue;
      const s = this.camera.screen(p);
      const distance = Math.hypot(point.x - s.x, point.y - s.y);
      if (distance <= Math.max(12, bodyRadius(body.radiusKm) * this.camera.zoom) && distance < best) {
        best = distance;
        match = body.id;
      }
    }
    return match;
  }

  private hitLink(point: Point): RenderLink | null {
    let match: RenderLink | null = null;
    let best = 9;
    for (const { link, a, b } of this.screenLinks) {
      if (link.emphasis === 'dim') continue;
      const distance = distanceToSegment(point, a, b);
      if (distance < best) {
        best = distance;
        match = link;
      }
    }
    return match;
  }

  private report(point: Point): void {
    const link = this.hitLink(point);
    const body = this.hitBody(point);
    this.hovered = body;
    if (body) {
      const name = this.input.bodies.find((b) => b.id === body)?.name ?? body;
      this.callbacks.onHover({ kind: 'body', id: body, name, x: point.x, y: point.y });
    } else if (link) {
      this.callbacks.onHover({ kind: 'link', info: link.info, x: point.x, y: point.y });
    } else {
      this.callbacks.onHover(null);
    }
  }

  private pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const p = this.local(event);
    this.pointers.set(event.pointerId, p);
    this.app.canvas.setPointerCapture(event.pointerId);
    if (this.pointers.size === 1) {
      this.gestureStart = p;
      this.dragged = false;
    } else this.dragged = true;
  };

  private pointerMove = (event: PointerEvent): void => {
    const p = this.local(event);
    const previous = this.pointers.get(event.pointerId);
    if (!previous) {
      this.report(p);
      return;
    }
    if (this.pointers.size >= 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(p.x - other.x, p.y - other.y);
        if (before > 0 && after > 0)
          this.camera.zoomAt(after / before, { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 });
      }
      this.dragged = true;
    } else {
      if (this.gestureStart && Math.hypot(p.x - this.gestureStart.x, p.y - this.gestureStart.y) > 5)
        this.dragged = true;
      if (this.dragged) {
        this.camera.pan(p.x - previous.x, p.y - previous.y);
        this.callbacks.onHover(null);
      }
    }
    this.pointers.set(event.pointerId, p);
  };

  private pointerUp = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    const tap = !this.dragged && this.pointers.size === 1;
    this.release(event);
    if (tap) this.report(this.local(event)); // a tap shows the same detail as hover
  };

  private release(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.app.canvas.hasPointerCapture(event.pointerId)) this.app.canvas.releasePointerCapture(event.pointerId);
    if (!this.pointers.size) this.gestureStart = null;
  }

  private pointerCancel = (event: PointerEvent): void => {
    this.dragged = true;
    this.release(event);
  };

  private pointerLeave = (): void => {
    this.hovered = null;
    this.callbacks.onHover(null);
  };

  private wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.camera.height : 1);
    this.camera.zoomAt(Math.exp(-delta * 0.002), this.local(event));
  };

  destroy(): void {
    this.observer?.disconnect();
    if (this.mounted) {
      const canvas = this.app.canvas;
      canvas.removeEventListener('pointerdown', this.pointerDown);
      canvas.removeEventListener('pointermove', this.pointerMove);
      canvas.removeEventListener('pointerup', this.pointerUp);
      canvas.removeEventListener('pointercancel', this.pointerCancel);
      canvas.removeEventListener('pointerleave', this.pointerLeave);
      canvas.removeEventListener('wheel', this.wheel);
      this.app.ticker.remove(this.frame);
    }
    this.app.destroy(true, { children: true, texture: true, textureSource: true });
  }
}
