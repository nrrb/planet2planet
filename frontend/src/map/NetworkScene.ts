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
import { bodyFill, LAYER_STYLES, layerColor, MAP_COLORS, type MapColors, type MapTheme } from './palette';

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
  /** Mark worlds as the route's origin (circle ring) or destination (square ring), labelled in text. */
  markers?: ReadonlyMap<string, 'from' | 'to'>;
  /** Draw every moon even when zoomed out, as a small dot. */
  showAllMoons?: boolean;
  /**
   * The history map: each world's state in a given year. A solid ring is a subspace constellation,
   * a dashed ring a conventional one, a filled disk a colony. Worlds not reached yet are faint.
   */
  marks?: ReadonlyMap<string, WorldMark>;
}

export interface WorldMark {
  constellation: 'none' | 'conventional' | 'subspace';
  colonized: boolean;
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
  private theme: MapTheme;
  private colors: MapColors;
  private sunDisk = new Graphics();
  /** Orbit paths, kept as data so they can be redrawn when the theme changes. */
  private orbitShapes: { g: Graphics; points?: Point[]; radius?: number }[] = [];
  private diskRadii = new Map<string, number>();

  private constructor(
    private app: Application,
    private input: SceneInput,
    private callbacks: SceneCallbacks,
    theme: MapTheme,
  ) {
    this.theme = theme;
    this.colors = MAP_COLORS[theme];
    this.time = input.startTime;
    this.overview = systemRadius(input.bodies, input.orbits) + 40;
    app.stage.addChild(this.orbitLayer, this.bodyLayer, this.overlay, this.labelLayer);

    this.bodyLayer.addChild(this.sunDisk);
    this.sunLabel = this.makeLabel('Sun', this.colors.muted);

    for (const body of input.bodies) {
      const orbit = input.orbits[body.id];
      const disk = new Graphics();
      this.disks.set(body.id, disk);
      this.diskRadii.set(body.id, bodyRadius(body.radiusKm));
      this.bodyLayer.addChild(disk);
      const track = new Graphics();
      this.orbitLayer.addChild(track);
      if (orbit.kind === 'moon') {
        const parent = input.bodies.find((b) => b.id === body.parent);
        const days = daysSinceJ2000(input.startTime);
        const offset = moonOffset(orbit, days);
        const radius = lunarRadius(parent?.radiusKm ?? 0, Math.hypot(offset.x, offset.y) * AU_KM);
        this.moonTracks.set(body.id, track);
        this.orbitShapes.push({ g: track, radius });
      } else {
        this.orbitShapes.push({ g: track, points: orbitTrack(orbit) });
      }
      this.labels.set(body.id, this.makeLabel(body.name, this.colors.text));
    }
    this.paint();
  }

  /** Draw (or redraw) everything whose colour depends on the theme. */
  private paint(): void {
    const c = this.colors;
    this.app.renderer.background.color = hex(c.background);
    const ring = { color: hex(c.outline), alpha: c.outlineAlpha, width: 1, pixelLine: true };
    this.sunDisk
      .clear()
      .circle(0, 0, bodyRadius(SUN_RADIUS_KM))
      .fill(hex(bodyFill('sun', this.theme)))
      .stroke(ring);
    for (const [id, disk] of this.disks) {
      disk
        .clear()
        .circle(0, 0, this.diskRadii.get(id) ?? 2)
        .fill(hex(bodyFill(id, this.theme)))
        .stroke(ring);
    }
    const track = { color: hex(c.track), alpha: c.trackAlpha, width: 1, pixelLine: true };
    for (const shape of this.orbitShapes) {
      shape.g.clear();
      if (shape.points)
        shape.g.poly(
          shape.points.flatMap((p) => [p.x, p.y]),
          true,
        );
      else shape.g.circle(0, 0, shape.radius ?? 0);
      shape.g.stroke(track);
    }
    for (const label of this.labels.values()) label.style.fill = c.text;
    this.sunLabel.style.fill = c.muted;
  }

  setTheme(theme: MapTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.colors = MAP_COLORS[theme];
    this.paint();
  }

  private makeLabel(text: string, fill: string): Text {
    const label = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill } });
    this.labelLayer.addChild(label);
    return label;
  }

  static async create(input: SceneInput, callbacks: SceneCallbacks, theme: MapTheme): Promise<NetworkScene> {
    const app = new Application();
    try {
      await app.init({
        backgroundColor: MAP_COLORS[theme].background,
        antialias: true,
        autoStart: false,
        preference: 'webgl',
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      return new NetworkScene(app, input, callbacks, theme);
    } catch (error) {
      if (app.renderer) app.destroy({ removeView: true });
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
    const { highlighted, dimOthers, labelPlanets, animate, markers, showAllMoons, marks } = this.state;
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
      const showMoon = !moon || emphasised || zoom >= 1.6 || Boolean(showAllMoons);
      const disk = this.disks.get(body.id);
      if (disk) {
        disk.visible = showMoon;
        disk.position.set(p.x, p.y);
        // However far out the camera is, a world stays at least a few pixels across.
        const minPx = moon ? 2.2 : 3;
        disk.scale.set(Math.max(1, minPx / (bodyRadius(body.radiusKm) * zoom)));
        const mark = marks?.get(body.id);
        if (marks) {
          // A colony is drawn solid, a world with only a constellation half faded, and one not yet reached nearly gone.
          disk.alpha = mark?.colonized ? 1 : mark && mark.constellation !== 'none' ? 0.5 : 0.14;
        } else {
          disk.alpha = dimOthers && !emphasised ? 0.3 : 1;
        }
      }
      const track = this.moonTracks.get(body.id);
      const parent = body.parent ? this.positions.get(body.parent) : null;
      if (track && parent) {
        track.position.set(parent.x, parent.y);
        // With every moon shown at overview zoom, its orbit ring would only add clutter.
        track.visible = showMoon && (!showAllMoons || emphasised || zoom >= 1.6);
      }
      const s = this.camera.screen(p);
      const label = this.labels.get(body.id);
      if (label) {
        const role = markers?.get(body.id);
        const text = role ? `${body.name} (${role})` : body.name;
        if (label.text !== text) label.text = text;
        const reached =
          !marks || (marks.get(body.id)?.constellation ?? 'none') !== 'none' || Boolean(marks.get(body.id)?.colonized);
        const wanted =
          reached &&
          (chosen ||
            Boolean(role) ||
            body.id === this.hovered ||
            (labelPlanets && !moon) ||
            (labelPlanets && moon && zoom >= 2.2));
        label.visible = showMoon && wanted;
        label.alpha = dimOthers && !chosen && body.id !== this.hovered ? 0.8 : 1;
        label.position.set(s.x + bodyRadius(body.radiusKm) * zoom + 7, s.y - 7);
      }
    }

    const g = this.overlay.clear();
    if (marks) this.drawMarks(g, marks);
    // Highlight rings.
    for (const id of highlighted) {
      const body = this.input.bodies.find((b) => b.id === id);
      const p = this.positions.get(id);
      if (!body || !p) continue;
      const s = this.camera.screen(p);
      const base = bodyRadius(body.radiusKm) * zoom + 6;
      const pulse = animate ? 1 + 0.18 * Math.sin(flowClock * 3) : 1;
      const r = base * pulse;
      // Origin: a circle. Destination: a square. So the two differ without relying on colour.
      if (markers?.get(id) === 'to') g.rect(s.x - r, s.y - r, r * 2, r * 2);
      else g.circle(s.x, s.y, r);
      g.stroke({ color: hex(this.colors.accent), width: 2, alpha: 0.9 });
    }
    this.drawLinks(g, flowClock);
  }

  /** Rings for the history map. The ring's style, not its colour alone, says which kind it is. */
  private drawMarks(g: Graphics, marks: ReadonlyMap<string, WorldMark>): void {
    const { zoom } = this.camera;
    for (const body of this.input.bodies) {
      const mark = marks.get(body.id);
      const p = this.positions.get(body.id);
      if (!mark || !p || mark.constellation === 'none') continue;
      const s = this.camera.screen(p);
      const base = Math.max(bodyRadius(body.radiusKm) * zoom, body.parent ? 2.2 : 3);
      const r = base + (body.parent ? 3 : 5);
      if (mark.constellation === 'subspace') {
        g.circle(s.x, s.y, r).stroke({ color: hex(this.colors.layers.backbone), width: 2, alpha: 0.95 });
      } else {
        const segments = 14;
        for (let i = 0; i < segments; i += 1) {
          const a0 = (i / segments) * Math.PI * 2;
          g.moveTo(s.x + r * Math.cos(a0), s.y + r * Math.sin(a0)).arc(
            s.x,
            s.y,
            r,
            a0,
            a0 + (Math.PI * 2) / segments / 2,
          );
        }
        g.stroke({ color: hex(this.colors.muted), width: 2, alpha: 0.95 });
      }
    }
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
      const color = hex(layerColor(this.theme, link.layer));
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
        this.strokePattern(g, a, b, length, [FLOW_DASH, FLOW_GAP], offset, hex(this.colors.flow), style.width, 0.85);
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
    // Destroy only what this scene created. Pixi's default fill for a Graphics is one shared
    // global white texture, so destroying Graphics with `texture: true` (as `app.destroy` does
    // for children) wipes it for every other map on the page and turns them blank.
    for (const g of [this.sunDisk, this.overlay, ...this.disks.values(), ...this.orbitShapes.map((o) => o.g)]) {
      g.destroy();
    }
    // A label's texture is its own, so it is safe, and needed, to release it.
    for (const label of [this.sunLabel, ...this.labels.values()]) {
      label.destroy({ texture: true, textureSource: true });
    }
    // Never pass `true` here: that also releases Pixi's global pools (the shared batch pool), and
    // the next frame of every other map on the page then throws and goes blank.
    this.app.destroy({ removeView: true });
  }
}
