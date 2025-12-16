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

    // FIX: Only insert into child if FULLY CONTAINED. 
    // If it spans boundaries, it must stay here.
    if (this.contains(this.northeast!.bounds, shapeBounds)) {
        return this.northeast!.insert(shape);
    }
    if (this.contains(this.northwest!.bounds, shapeBounds)) {
        return this.northwest!.insert(shape);
    }
    if (this.contains(this.southeast!.bounds, shapeBounds)) {
        return this.southeast!.insert(shape);
    }
    if (this.contains(this.southwest!.bounds, shapeBounds)) {
        return this.southwest!.insert(shape);
    }

    // If it doesn't fit fully into any child, keep it in this node
    this.shapes.push(shape);
    return true;
  }

  private contains(outer: Rect, inner: Rect): boolean {
    return (
        inner.x >= outer.x &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y >= outer.y &&
        inner.y + inner.height <= outer.y + outer.height
    );
  }

  remove(shape: Shape): boolean {
    const shapeBounds = getShapeBounds(shape);
    if (!shapeBounds) return false;

    if (!this.intersects(this.bounds, shapeBounds)) {
      return false;
    }

    // Check if it's in this node's list
    const index = this.shapes.findIndex(s => s.id === shape.id);
    if (index !== -1) {
      this.shapes.splice(index, 1);
      return true;
    }

    // Check children
    if (this.divided) {
      if (this.northeast?.remove(shape)) return true;
      if (this.northwest?.remove(shape)) return true;
      if (this.southeast?.remove(shape)) return true;
      if (this.southwest?.remove(shape)) return true;
    }

    return false;
  }

  update(oldShape: Shape, newShape: Shape): void {
    this.remove(oldShape);
    this.insert(newShape);
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
