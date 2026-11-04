type Press = { id: number; x: number; y: number; time: number; moved: boolean };
export class TouchWalk {
  walking = false;
  private press: Press | null = null;
  private tap: { x: number; y: number; time: number } | null = null;

  start(id: number, x: number, y: number, time: number) {
    const tap = this.tap;
    this.walking = Boolean(
      tap &&
        time >= tap.time &&
        time - tap.time <= 350 &&
        Math.hypot(x - tap.x, y - tap.y) <= 30,
    );
    this.tap = null;
    this.press = { id, x, y, time, moved: false };
  }
  move(id: number, x: number, y: number) {
    if (
      this.press?.id === id &&
      Math.hypot(x - this.press.x, y - this.press.y) > 12
    )
      this.press.moved = true;
  }
  end(id: number, time: number, cancelled = false) {
    const press = this.press;
    if (!press || press.id !== id) return;
    this.tap =
      !cancelled &&
      !this.walking &&
      !press.moved &&
      time >= press.time &&
      time - press.time <= 250
        ? { x: press.x, y: press.y, time }
        : null;
    this.press = null;
    this.walking = false;
  }
  cancel() {
    this.walking = false;
    this.press = null;
    this.tap = null;
  }
}
