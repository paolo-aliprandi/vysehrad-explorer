export type NearbyVoice = { id: string; distance: number };
type SoundFrame = {
  delta: number;
  distance: number;
  audible: boolean;
  walking: boolean;
  softGround: () => boolean;
  people: readonly NearbyVoice[];
};

export class WorldAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private enabled = false;
  private disposed = false;
  private stride = 0;
  private time = 0;
  private nextVoice = 0;
  private encounters = new Map<string, number>();

  constructor(private report: (message: string) => void) {}

  async setEnabled(enabled: boolean) {
    if (this.disposed) return false;
    this.enabled = enabled;
    if (!enabled) {
      if (this.master && this.context)
        this.master.gain.setValueAtTime(0, this.context.currentTime);
      this.stride = 0;
      return false;
    }
    try {
      this.context ??= new AudioContext();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate,
          this.context.sampleRate,
        );
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = Math.random() * 2 - 1;
      }
      await this.context.resume();
      if (this.disposed) return false;
      if (this.context.state !== 'running')
        throw new Error('Audio playback is not available yet.');
      this.master.gain.setValueAtTime(0, this.context.currentTime);
      return this.enabled;
    } catch (error) {
      console.warn('World sound could not start:', error);
      this.enabled = false;
      this.report('Sound could not start. Use the sound button to try again.');
      return false;
    }
  }

  update(frame: SoundFrame) {
    const context = this.context,
      master = this.master;
    if (!context || !master || !this.enabled || context.state !== 'running')
      return;
    master.gain.setTargetAtTime(
      frame.audible ? 0.18 : 0,
      context.currentTime,
      0.025,
    );
    if (!frame.audible) {
      this.stride = 0;
      return;
    }
    this.time += frame.delta;
    if (frame.walking) {
      this.stride += frame.distance;
      if (this.stride >= 0.8) {
        this.stride %= 0.8;
        this.footstep(frame.softGround());
      }
    } else this.stride = 0;
    if (this.time < this.nextVoice) return;
    const person = frame.people.find(
      (person) =>
        person.distance < 7 &&
        (this.encounters.get(person.id) ?? -Infinity) <= this.time - 24,
    );
    if (!person) return;
    this.encounters.set(person.id, this.time);
    this.nextVoice = this.time + 8;
    this.murmur(1 - person.distance / 8);
  }

  private output() {
    const { context, master, noise } = this;
    if (!context || !master || !noise)
      throw new Error('World sound has not been initialized.');
    return { context, master, noise };
  }

  private noiseBurst(duration: number, frequency: number, volume: number) {
    const { context, master, noise } = this.output();
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const envelope = context.createGain();
    const now = context.currentTime;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(now, Math.random() * 0.5);
    source.stop(now + duration);
  }

  private footstep(soft: boolean) {
    this.noiseBurst(soft ? 0.16 : 0.09, soft ? 1600 : 650, soft ? 0.11 : 0.16);
  }

  private murmur(proximity: number) {
    this.noiseBurst(0.9, 550 + Math.random() * 350, 0.035 * proximity);
    const { context, master } = this.output(),
      now = context.currentTime;
    const voice = context.createOscillator();
    voice.type = 'triangle';
    voice.frequency.setValueAtTime(115 + Math.random() * 50, now);
    voice.frequency.linearRampToValueAtTime(
      135 + Math.random() * 35,
      now + 0.65,
    );
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, now);
    for (let syllable = 0; syllable < 3; syllable++) {
      envelope.gain.linearRampToValueAtTime(
        0.025 * proximity,
        now + syllable * 0.23 + 0.07,
      );
      envelope.gain.linearRampToValueAtTime(0.001, now + syllable * 0.23 + 0.2);
    }
    envelope.gain.linearRampToValueAtTime(0, now + 0.85);
    voice.connect(filter).connect(envelope).connect(master);
    voice.onended = () => {
      voice.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    voice.start();
    voice.stop(now + 0.9);
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    this.master?.disconnect();
    void this.context
      ?.close()
      .catch((error: unknown) =>
        console.warn('World sound could not close:', error),
      );
    this.encounters.clear();
  }
}
