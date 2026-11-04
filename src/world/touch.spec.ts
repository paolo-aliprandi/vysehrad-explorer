import { TouchWalk } from './touch';

it('looks on the first drag and walks only while the second nearby tap is held', () => {
  const touch = new TouchWalk();
  touch.start(1, 100, 200, 0);
  expect(touch.walking).toBe(false);
  touch.end(1, 100);
  touch.start(2, 104, 203, 250);
  expect(touch.walking).toBe(true);
  touch.move(2, 160, 210);
  expect(touch.walking).toBe(true);
  touch.end(2, 1000);
  expect(touch.walking).toBe(false);
});
it('does not interpret a drag, distant tap or long delay as walking', () => {
  for (const [x, time, drag] of [
    [100, 300, true],
    [200, 300, false],
    [100, 600, false],
  ] as const) {
    const touch = new TouchWalk();
    touch.start(1, 100, 200, 0);
    if (drag) touch.move(1, 140, 200);
    touch.end(1, 100);
    touch.start(2, x, 200, time);
    expect(touch.walking).toBe(false);
  }
});
it('cancels movement and tap history on interruption and ignores a different pointer release', () => {
  const touch = new TouchWalk();
  touch.start(1, 0, 0, 0);
  touch.end(1, 50);
  touch.start(2, 0, 0, 100);
  touch.end(3, 120);
  expect(touch.walking).toBe(true);
  touch.cancel();
  expect(touch.walking).toBe(false);
  touch.start(4, 0, 0, 150);
  expect(touch.walking).toBe(false);
  touch.end(4, 180, true);
  touch.start(5, 0, 0, 220);
  expect(touch.walking).toBe(false);
});
