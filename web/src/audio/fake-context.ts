import type { ContextLike, GainLike, NodeLike, ParamLike, SourceLike } from "./engine";

export type Automation = [method: string, value: number, time: number];

export class FakeParam implements ParamLike {
  calls: Automation[] = [];
  constructor(public value = 1) {}
  setValueAtTime(value: number, time: number) {
    this.calls.push(["set", value, time]);
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push(["ramp", value, time]);
    this.value = value;
  }
  cancelScheduledValues(time: number) {
    this.calls.push(["cancel", 0, time]);
  }
  /** Last ramp target, or the set value if there was no ramp. */
  get target(): number {
    return this.value;
  }
}

class FakeNode implements NodeLike {
  outputs: NodeLike[] = [];
  connect(destination: NodeLike) {
    this.outputs.push(destination);
    return destination;
  }
  disconnect() {
    this.outputs = [];
  }
}

export class FakeGain extends FakeNode implements GainLike {
  gain = new FakeParam(1);
}

export class FakeSource extends FakeNode implements SourceLike {
  buffer: AudioBuffer | null = null;
  loop = false;
  started: number | null = null;
  stopped: number | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  start(when = 0) {
    this.started = when;
  }
  stop(when = 0) {
    this.stopped = when;
  }
}

/** A deterministic stand-in for AudioContext: time is set by the test, every node is recorded. */
export class FakeContext implements ContextLike {
  currentTime = 0;
  state = "running";
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  suspends = 0;
  resumes = 0;
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createDynamicsCompressor() {
    return new FakeNode();
  }
  async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    if (new TextDecoder().decode(data).startsWith("bad")) throw new Error("undecodable");
    return { duration: 1 } as AudioBuffer;
  }
  async suspend() {
    this.suspends++;
    this.state = "suspended";
  }
  async resume() {
    this.resumes++;
    this.state = "running";
  }
}

export const fakeBuffer = (duration = 1) => ({ duration }) as AudioBuffer;
