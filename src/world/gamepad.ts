export type ControllerAction =
  | 'jump'
  | 'interact'
  | 'throw'
  | 'photo'
  | 'map'
  | 'menu'
  | 'flight'
  | 'previous'
  | 'next'
  | 'shoot'
  | 'equip';
// Triggers remain analog for aiming and zoom; firing is edge-triggered.

export type ControllerInput = {
  name: string | null;
  supported: boolean;
  move: readonly [number, number];
  look: readonly [number, number];
  sprint: boolean;
  lift: number;
  zoom: number;
  aim: boolean;
  pressed: ReadonlySet<ControllerAction>;
};

export const idleController: ControllerInput = {
  name: null,
  supported: false,
  move: [0, 0],
  look: [0, 0],
  sprint: false,
  lift: 0,
  zoom: 0,
  aim: false,
  pressed: new Set(),
};

function stick(x = 0, y = 0): readonly [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0];
  const magnitude = Math.hypot(x, y);
  const deadzone = 0.18;
  if (magnitude <= deadzone) return [0, 0];
  const strength = (Math.min(1, magnitude) - deadzone) / (1 - deadzone);
  return [(x / magnitude) * strength, (y / magnitude) * strength];
}

const buttons: readonly (readonly [number, ControllerAction])[] = [
  [0, 'jump'],
  [1, 'interact'],
  [2, 'throw'],
  [3, 'photo'],
  [8, 'map'],
  [9, 'menu'],
  [11, 'flight'],
  [7, 'shoot'],
  [4, 'equip'],
];

export class ControllerReader {
  private identity = '';
  private held = new Set<number>();
  private navigation = 0;
  private repeatAt = 0;

  read(pads: readonly (Gamepad | null)[], now: number): ControllerInput {
    const connected = pads.filter((pad) => pad?.connected);
    const pad =
      connected.find((pad) => `${pad?.index}:${pad?.id}` === this.identity) ??
      connected.find((pad) => pad?.mapping === 'standard') ??
      connected[0];
    if (!pad) {
      this.identity = '';
      this.held.clear();
      this.navigation = 0;
      return idleController;
    }
    if (pad.mapping !== 'standard') return { ...idleController, name: pad.id };
    const identity = `${pad.index}:${pad.id}`;
    if (identity !== this.identity) {
      this.identity = identity;
      this.held.clear();
      this.navigation = 0;
    }
    const held = new Set(
      pad.buttons.flatMap((button, index) => (button.pressed ? [index] : [])),
    );
    const pressed = new Set<ControllerAction>();
    for (const [index, action] of buttons)
      if (held.has(index) && !this.held.has(index)) pressed.add(action);
    this.held = held;
    const move = stick(pad.axes[0], pad.axes[1]);
    const direction =
      held.has(12) || held.has(14) || move[1] < -0.65 || move[0] < -0.65
        ? -1
        : held.has(13) || held.has(15) || move[1] > 0.65 || move[0] > 0.65
          ? 1
          : 0;
    if (direction && (direction !== this.navigation || now >= this.repeatAt)) {
      pressed.add(direction < 0 ? 'previous' : 'next');
      this.repeatAt = now + (direction !== this.navigation ? 400 : 160);
    }
    this.navigation = direction;
    return {
      name: pad.id,
      supported: true,
      move,
      look: stick(pad.axes[2], pad.axes[3]),
      sprint: held.has(10),
      lift: Number(held.has(5)) - Number(held.has(4)),
      zoom: (pad.buttons[6]?.value ?? 0) - (pad.buttons[7]?.value ?? 0),
      aim: (pad.buttons[6]?.value ?? 0) > 0.4,
      pressed,
    };
  }
}
