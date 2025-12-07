import { Rect, Shape } from '../types';
import { getShapeBounds } from './geometry';

export class QuadTree {
  private bounds: Rect;
  private capacity: number;
  private shapes: Shape[];
  private divided: boolean;
  private northeast: QuadTree | null = null;
  private northwest: QuadTree | null = null;
  private southeast: QuadTree | null = null;
  private southwest: QuadTree | null = null;

  constructor(bounds: Rect, capacity: number = 4) {
    this.bounds = bounds;
    this.capacity = capacity;
    this.shapes = [];
    this.divided = false;
  }

  insert(shape: Shape): boolean {
    const shapeBounds = getShapeBounds(shape);
    if (!shapeBounds) return false;

    if (!this.intersects(this.bounds, shapeBounds)) {
      return false;
    }

    if (this.shapes.length < this.capacity) {
      this.shapes.push(shape);
      return true;
    }

    if (!this.divided) {
      this.subdivide();
    }

    if (this.northeast?.insert(shape)) return true;
    if (this.northwest?.insert(shape)) return true;
    if (this.southeast?.insert(shape)) return true;
    if (this.southwest?.insert(shape)) return true;

    // Se não couber perfeitamente em um quadrante (ex: overlap), mantém no pai
    this.shapes.push(shape);
    return true;
  }

  query(range: Rect, found: Shape[] = []): Shape[] {
    if (!this.intersects(this.bounds, range)) {
      return found;
    }

    for (const shape of this.shapes) {
      const b = getShapeBounds(shape);
      if (b && this.intersects(range, b)) {
        found.push(shape);
      }
    }

    if (this.divided) {
      this.northwest?.query(range, found);
      this.northeast?.query(range, found);
      this.southwest?.query(range, found);
      this.southeast?.query(range, found);
    }

    return found;
  }

  clear() {
    this.shapes = [];
    this.divided = false;
    this.northeast = null;
    this.northwest = null;
    this.southeast = null;
    this.southwest = null;
  }

  private subdivide() {
    const { x, y, width, height } = this.bounds;
    const w = width / 2;
    const h = height / 2;

    this.northeast = new QuadTree({ x: x + w, y: y, width: w, height: h }, this.capacity);
    this.northwest = new QuadTree({ x: x, y: y, width: w, height: h }, this.capacity);
    this.southeast = new QuadTree({ x: x + w, y: y + h, width: w, height: h }, this.capacity);
    this.southwest = new QuadTree({ x: x, y: y + h, width: w, height: h }, this.capacity);

    this.divided = true;
  }

  private intersects(a: Rect, b: Rect): boolean {
    return !(
      b.x > a.x + a.width ||
      b.x + b.width < a.x ||
      b.y > a.y + a.height ||
      b.y + b.height < a.y
    );
  }
}
