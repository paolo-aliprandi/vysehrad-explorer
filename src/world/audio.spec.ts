import { WorldAudio } from './audio';

function audioContext() {
  const parameter = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => {
    const result = {
      connect: vi.fn(() => result),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      gain: parameter(),
      frequency: parameter(),
      Q: parameter(),
    };
    return result;
  };
  const context = {
    currentTime: 0,
    sampleRate: 100,
    state: 'running',
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createBuffer: vi.fn(() => ({
      getChannelData: () => new Float32Array(100),
    })),
    createGain: vi.fn(node),
    createBiquadFilter: vi.fn(node),
    createBufferSource: vi.fn(node),
    createOscillator: vi.fn(node),
  };
  const constructor = vi.fn(function () {
    return context;
  });
  vi.stubGlobal('AudioContext', constructor);
  return { context, constructor };
}
afterEach(() => vi.unstubAllGlobals());

it('starts only after activation and gates quiet footsteps by actual movement, grounded walking and mute', async () => {
  const { context, constructor } = audioContext();
  const audio = new WorldAudio(vi.fn());
  const frame = {
    delta: 0.1,
    distance: 0.4,
    audible: true,
    walking: true,
    softGround: () => false,
    people: [],
  };
  audio.update(frame);
  expect(constructor).not.toHaveBeenCalled();
  expect(await audio.setEnabled(true)).toBe(true);
  audio.update(frame);
  expect(context.createBufferSource).not.toHaveBeenCalled();
  audio.update(frame);
  expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  audio.update({ ...frame, distance: 20, walking: false });
  audio.update({ ...frame, distance: 20, audible: false });
  expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  await audio.setEnabled(false);
  audio.update({ ...frame, distance: 20 });
  expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  audio.dispose();
  expect(context.close).toHaveBeenCalledOnce();
});

it('limits nearby social murmurs by distance and per-person cooldown rather than repeating every frame', async () => {
  const { context } = audioContext();
  const audio = new WorldAudio(vi.fn());
  await audio.setEnabled(true);
  const frame = {
    delta: 1,
    distance: 0,
    audible: true,
    walking: false,
    softGround: () => false,
    people: [{ id: 'guest', distance: 8 }],
  };
  audio.update(frame);
  expect(context.createOscillator).not.toHaveBeenCalled();
  frame.people[0].distance = 3;
  for (let i = 0; i < 24; i++) audio.update(frame);
  expect(context.createOscillator).toHaveBeenCalledTimes(1);
  audio.update(frame);
  expect(context.createOscillator).toHaveBeenCalledTimes(2);
  audio.dispose();
});

it('reports failed browser activation instead of pretending sound is playing', async () => {
  const { context } = audioContext();
  context.resume.mockRejectedValue(new Error('Audio permission denied'));
  const report = vi.fn();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const audio = new WorldAudio(report);
  expect(await audio.setEnabled(true)).toBe(false);
  expect(report).toHaveBeenCalledWith(
    expect.stringContaining('Sound could not start'),
  );
  audio.dispose();
  warning.mockRestore();
});
