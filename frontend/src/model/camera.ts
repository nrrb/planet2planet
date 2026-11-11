import type { Point } from './types';
import { SCALE } from './scaling';
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  following: string | null = null;
  width = 1;
  height = 1;
  screen(p: Point): Point {
    return { x: this.width / 2 + (p.x - this.x) * this.zoom, y: this.height / 2 - (p.y - this.y) * this.zoom };
  }
  world(p: Point): Point {
    return { x: this.x + (p.x - this.width / 2) / this.zoom, y: this.y - (p.y - this.height / 2) / this.zoom };
  }
  fit(radius: number) {
    this.zoom = Math.max(
      SCALE.minZoom,
      Math.min(SCALE.maxZoom, Math.min(this.width, this.height) / (2 * radius * SCALE.focusPadding)),
    );
  }
  reset(radius: number) {
    this.following = null;
    this.x = 0;
    this.y = 0;
    this.fit(radius);
  }
  pan(dx: number, dy: number) {
    this.following = null;
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom;
  }
  zoomAt(factor: number, point: Point) {
    const before = this.world(point);
    this.zoom = Math.max(SCALE.minZoom, Math.min(SCALE.maxZoom, this.zoom * factor));
    if (!this.following) {
      const after = this.world(point);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
    }
  }
  follow(positions: Map<string, Point>) {
    const point = this.following ? positions.get(this.following) : null;
    if (point) {
      this.x = point.x;
      this.y = point.y;
    }
  }
}
