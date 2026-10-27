"""Synthesizes the bundled show audio (mood loops, SFX cues, stingers) and writes LICENSES.json.

Everything is generated from code with fixed seeds, so the sounds are self-made and released as CC0.
Run: .venv\\Scripts\\python.exe -m pip install -e ".[assets]"; .venv\\Scripts\\python.exe scripts\\gen_audio_assets.py
"""

import json
from collections.abc import Callable
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000
OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "audio"

Signal = np.ndarray


# --- primitives ------------------------------------------------------------------------------------


def times(seconds: float) -> Signal:
    return np.arange(int(seconds * SR)) / SR


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def envelope(n: int, attack: float, release: float) -> Signal:
    env = np.ones(n)
    a = min(n, max(1, int(attack * SR)))
    r = min(n - a, max(1, int(release * SR)))
    env[:a] = np.linspace(0, 1, a)
    if r > 0:
        env[n - r :] *= np.linspace(1, 0, r)
    return env


def harmonics(freq: float, seconds: float, amps: Callable[[int, Signal], Signal], count: int, detune: float = 0.0) -> Signal:
    t = times(seconds)
    out = np.zeros_like(t)
    for k in range(1, count + 1):
        f = freq * k * (1 + detune * k * k)
        if f > SR / 2 - 1000:
            break
        out += amps(k, t) * np.sin(2 * np.pi * f * t + k * 0.7)
    return out


def band_noise(seconds: float, low: float, high: float, rng: np.random.Generator) -> Signal:
    n = int(seconds * SR)
    spectrum = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spectrum[(freqs < low) | (freqs > high)] = 0
    noise = np.fft.irfft(spectrum, n)
    return noise / (np.max(np.abs(noise)) + 1e-9)


def lowpass(signal: Signal, cutoff: float) -> Signal:
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(len(signal), 1 / SR)
    spectrum *= 1 / (1 + (freqs / cutoff) ** 4)
    return np.fft.irfft(spectrum, len(signal))


def convolve(a: Signal, b: Signal) -> Signal:
    n = len(a) + len(b) - 1
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, size) * np.fft.rfft(b, size), size)[:n]


def reverb(signal: Signal, seconds: float, wet: float, rng: np.random.Generator) -> Signal:
    t = times(seconds)
    impulse = lowpass(rng.standard_normal(len(t)) * np.exp(-t / (seconds / 5)), 5000)
    impulse /= np.sqrt(np.sum(impulse**2)) + 1e-9
    tail = convolve(signal, impulse)
    dry = np.concatenate([signal, np.zeros(len(tail) - len(signal))])
    return dry * (1 - wet) + tail * wet


def fit(signal: Signal, seconds: float) -> Signal:
    n = int(seconds * SR)
    return signal[:n] if len(signal) >= n else np.concatenate([signal, np.zeros(n - len(signal))])


# --- instruments -----------------------------------------------------------------------------------


def pluck(freq: float, seconds: float, bright: float = 1.0) -> Signal:
    sig = harmonics(freq, seconds, lambda k, t: (1 / k**1.3) * np.exp(-t * (2.5 + 1.8 * k / bright)), 16, 0.0004)
    return sig * envelope(len(sig), 0.004, 0.05)


def brass(freq: float, seconds: float, bright: float = 1.0) -> Signal:
    t = times(seconds)
    swell = np.minimum(1, t / 0.06)
    vibrato = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.4)
    out = np.zeros_like(t)
    phase = 2 * np.pi * freq * np.cumsum(vibrato) / SR
    for k in range(1, 14):
        if freq * k > 12000:
            break
        out += (1 / k) * swell ** (1 + k * 0.35 / bright) * np.sin(k * phase)
    return out * envelope(len(t), 0.02, 0.08)


def strings(freq: float, seconds: float, attack: float = 0.35) -> Signal:
    out = np.zeros(int(seconds * SR))
    for detune in (-0.004, 0.0, 0.005):
        out += harmonics(freq * (1 + detune), seconds, lambda k, t: (1 / k) * (0.6 if k > 6 else 1), 12)
    return out / 3 * envelope(len(out), attack, min(0.5, seconds / 3))


def flute(freq: float, seconds: float, rng: np.random.Generator) -> Signal:
    t = times(seconds)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5 * t) * np.minimum(1, t / 0.3)
    phase = 2 * np.pi * freq * np.cumsum(vib) / SR
    tone = np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.08 * np.sin(3 * phase)
    breath = band_noise(seconds, freq, freq * 4, rng) * 0.05
    return (tone + breath) * envelope(len(t), 0.06, 0.15)


def bell(freq: float, seconds: float, decay: float = 1.0) -> Signal:
    t = times(seconds)
    partials = [(1.0, 1.0, 1.2), (2.0, 0.6, 1.6), (2.4, 0.45, 2.2), (3.0, 0.35, 2.6), (4.5, 0.25, 3.4), (5.33, 0.2, 4.0), (6.8, 0.12, 5.0)]
    out = np.zeros_like(t)
    for ratio, amp, d in partials:
        if freq * ratio < SR / 2 - 1000:
            out += amp * np.exp(-t * d / decay) * np.sin(2 * np.pi * freq * ratio * t)
    return out * envelope(len(t), 0.002, 0.05)


def drum(freq: float, seconds: float, drop: float, rng: np.random.Generator, noise: float = 0.3, decay: float = 6.0) -> Signal:
    t = times(seconds)
    pitch = freq * (1 + drop * np.exp(-t * 30))
    body = np.sin(2 * np.pi * np.cumsum(pitch) / SR) * np.exp(-t * decay)
    hit = band_noise(seconds, 80, 3000, rng) * np.exp(-t * 40) * noise
    return (body + hit) * envelope(len(t), 0.001, 0.02)


def snare(seconds: float, rng: np.random.Generator, level: float = 1.0) -> Signal:
    t = times(seconds)
    rattle = band_noise(seconds, 1500, 9000, rng) * np.exp(-t * 22)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return (rattle + tone) * level


def jingle(seconds: float, rng: np.random.Generator) -> Signal:
    t = times(seconds)
    return band_noise(seconds, 5000, 14000, rng) * np.exp(-t * 18)


def cymbal(seconds: float, rng: np.random.Generator) -> Signal:
    t = times(seconds)
    return band_noise(seconds, 3000, 16000, rng) * np.exp(-t * 1.6) * envelope(len(t), 0.003, 0.2)


def voices(freqs: list[float], seconds: float, vowel: tuple[float, float, float] = (700, 1220, 2600)) -> Signal:
    out = np.zeros(int(seconds * SR))
    for i, f0 in enumerate(freqs):
        for detune in (-0.006, 0.006):
            f = f0 * (1 + detune)

            def amp(k: int, t: Signal, f: float = f) -> Signal:
                fk = f * k
                weight = sum(np.exp(-(((fk - formant) / (formant * 0.18)) ** 2)) for formant in vowel)
                return (weight + 0.02) / np.sqrt(k) * (1 + 0.01 * np.sin(2 * np.pi * (5 + i * 0.3) * t))

            out += harmonics(f, seconds, amp, 40)
    return out * envelope(len(out), 0.5, 0.8)


# --- composition helpers ---------------------------------------------------------------------------

MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]


def chord(root: int, quality: str) -> list[int]:
    return [root, root + (4 if quality == "maj" else 3), root + 7]


class Loop:
    """Stereo loop: notes that run past the end wrap around to the start, so it repeats seamlessly."""

    def __init__(self, bpm: float, beats: float, seed: int) -> None:
        self.beat = 60 / bpm
        self.length = int(beats * self.beat * SR)
        self.left = np.zeros(self.length)
        self.right = np.zeros(self.length)
        self.rng = np.random.default_rng(seed)

    def add(self, signal: Signal, at_beats: float, gain: float = 1.0, pan: float = 0.0) -> None:
        start = int(at_beats * self.beat * SR) % self.length
        left = gain * np.cos((pan + 1) * np.pi / 4)
        right = gain * np.sin((pan + 1) * np.pi / 4)
        pos = 0
        while pos < len(signal):
            begin = (start + pos) % self.length
            take = min(len(signal) - pos, self.length - begin)
            self.left[begin : begin + take] += signal[pos : pos + take] * left
            self.right[begin : begin + take] += signal[pos : pos + take] * right
            pos += take

    def secs(self, beats: float) -> float:
        return beats * self.beat

    def render(self, wet: float = 0.25, room: float = 1.8) -> Signal:
        out = []
        for channel in (self.left, self.right):
            tail = reverb(channel, room, wet, self.rng)
            looped = tail[: self.length].copy()
            spill = tail[self.length :]
            looped[: len(spill)] += spill[: self.length]
            out.append(looped)
        stereo = np.stack(out, axis=1)
        return stereo / (np.max(np.abs(stereo)) + 1e-9) * 0.85


# --- mood loops ------------------------------------------------------------------------------------


def overture() -> Signal:
    loop = Loop(104, 32, 1)
    progression = [(62, "maj"), (67, "maj"), (69, "maj"), (62, "maj"), (71, "min"), (67, "maj"), (69, "maj"), (62, "maj")]
    for bar, (root, quality) in enumerate(progression):
        for note in chord(root - 12, quality):
            loop.add(strings(hz(note), loop.secs(4)), bar * 4, 0.18, -0.3)
        loop.add(pluck(hz(root - 24), loop.secs(1.5), 0.6), bar * 4, 0.5)
        loop.add(pluck(hz(root - 24), loop.secs(1.5), 0.6), bar * 4 + 2, 0.4)
        loop.add(drum(hz(root - 24), 1.2, 0.3, loop.rng, 0.2, 3.0), bar * 4, 0.45, 0.2)
    melody = [
        (0, 1, 74), (1, 0.5, 74), (1.5, 0.5, 78), (2, 2, 81),
        (4, 1, 79), (5, 1, 78), (6, 2, 76),
        (8, 1, 76), (9, 0.5, 78), (9.5, 0.5, 79), (10, 2, 81),
        (12, 1.5, 78), (13.5, 0.5, 76), (14, 2, 74),
        (16, 1, 71), (17, 1, 74), (18, 2, 78),
        (20, 1, 79), (21, 1, 81), (22, 2, 83),
        (24, 1, 81), (25, 0.5, 79), (25.5, 0.5, 78), (26, 2, 76),
        (28, 3, 74),
    ]
    for at, length, note in melody:
        loop.add(brass(hz(note), loop.secs(length) * 0.95, 1.2), at, 0.32, 0.25)
    loop.add(cymbal(2.5, loop.rng), 0, 0.12)
    for i in range(8):
        loop.add(snare(0.12, loop.rng, 0.25), 30 + i * 0.25, 0.4 + i * 0.05, -0.2)
    return loop.render()


def intrigue() -> Signal:
    loop = Loop(92, 32, 2)
    progression = [(62, "min"), (58, "maj"), (55, "min"), (57, "maj")] * 2
    pattern = [0, 2, 1, 2, 0, 2, 1, 2]
    for bar, (root, quality) in enumerate(progression):
        notes = chord(root, quality)
        for i, idx in enumerate(pattern):
            loop.add(pluck(hz(notes[idx]), 0.35, 0.5), bar * 4 + i * 0.5, 0.35, -0.4 + 0.1 * (i % 3))
        loop.add(strings(hz(root - 24), loop.secs(4), 0.5), bar * 4, 0.16)
        for beat in range(4):
            loop.add(drum(1200 if beat % 2 == 0 else 900, 0.08, 0.0, loop.rng, 0.05, 60), bar * 4 + beat, 0.12, 0.6)
    melody = [(2, 1.5, 69), (3.5, 0.5, 70), (4, 2, 69), (10, 1, 67), (11, 1, 65), (12, 3, 64), (18, 1.5, 69), (19.5, 0.5, 72), (20, 2, 70), (26, 1, 69), (27, 1, 67), (28, 3, 69)]
    for at, length, note in melody:
        loop.add(flute(hz(note), loop.secs(length), loop.rng), at, 0.22, 0.3)
    return loop.render(0.3, 2.2)


def feast() -> Signal:
    loop = Loop(120, 32, 3)  # 6/8: a beat is a dotted quarter, eighths are thirds of a beat
    progression = [(55, "maj"), (60, "maj"), (62, "maj"), (55, "maj"), (64, "min"), (60, "maj"), (62, "maj"), (55, "maj")] * 2
    jig = [[0, 2, 4, 2, 0, 2], [4, 2, 0, 1, 2, 4], [5, 4, 2, 4, 2, 0], [2, 1, 0, 1, 2, 4], [4, 5, 7, 5, 4, 2], [2, 4, 2, 1, 0, 1]]
    for bar, (root, quality) in enumerate(progression):
        scale = [root + 12 + s for s in (MAJOR if quality == "maj" else MINOR)] + [root + 24]
        for i, degree in enumerate(jig[bar % 6]):
            loop.add(pluck(hz(scale[degree]), 0.4, 1.4), bar * 2 + i / 3, 0.3, 0.3)
        loop.add(pluck(hz(root - 12), 0.8, 0.7), bar * 2, 0.45, -0.2)
        loop.add(pluck(hz(root - 5), 0.8, 0.7), bar * 2 + 1, 0.35, -0.2)
        for note in chord(root, quality):
            loop.add(pluck(hz(note), 0.6, 0.9), bar * 2 + 1 / 3, 0.12, -0.5)
            loop.add(pluck(hz(note), 0.6, 0.9), bar * 2 + 4 / 3, 0.12, -0.5)
        for i in range(6):
            loop.add(jingle(0.15, loop.rng), bar * 2 + i / 3, 0.18 if i % 3 == 0 else 0.08, 0.5)
        loop.add(drum(90, 0.4, 0.5, loop.rng, 0.3, 9), bar * 2, 0.5)
        loop.add(drum(110, 0.3, 0.5, loop.rng, 0.3, 11), bar * 2 + 1, 0.35)
    return loop.render(0.2, 1.4)


def battle() -> Signal:
    loop = Loop(140, 32, 4)
    progression = [(52, "min"), (48, "maj"), (50, "maj"), (52, "min"), (52, "min"), (48, "maj"), (47, "maj"), (52, "min")]
    for bar, (root, quality) in enumerate(progression):
        for i in range(8):
            loop.add(brass(hz(root - 12 + (7 if i in (3, 7) else 0)), loop.secs(0.45), 0.7), bar * 4 + i * 0.5, 0.22, -0.1)
        for note in chord(root, quality):
            loop.add(strings(hz(note + 12), loop.secs(3.5), 0.05), bar * 4, 0.1, 0.3)
        for at, gain in ((0, 0.9), (1.5, 0.6), (2, 0.8), (3, 0.6), (3.5, 0.5)):
            loop.add(drum(55, 0.8, 1.2, loop.rng, 0.5, 5), bar * 4 + at, gain)
        loop.add(snare(0.2, loop.rng), bar * 4 + 1, 0.3, 0.3)
        loop.add(snare(0.2, loop.rng), bar * 4 + 3, 0.3, 0.3)
        if bar in (3, 7):
            for i in range(8):
                loop.add(snare(0.1, loop.rng, 0.6), bar * 4 + 2 + i * 0.25, 0.2 + i * 0.03, -0.3)
    loop.add(cymbal(2, loop.rng), 0, 0.15)
    return loop.render(0.18, 1.4)


def dread() -> Signal:
    loop = Loop(60, 24, 5)
    for bar in range(6):
        loop.add(strings(hz(36), loop.secs(4), 1.0), bar * 4, 0.3)
        loop.add(strings(hz(43), loop.secs(4), 1.0), bar * 4, 0.18, -0.4)
        loop.add(strings(hz(49 if bar % 2 else 48), loop.secs(4), 1.5), bar * 4, 0.1, 0.4)
        loop.add(drum(48, 0.5, 0.4, loop.rng, 0.1, 7), bar * 4, 0.6)
        loop.add(drum(45, 0.5, 0.4, loop.rng, 0.1, 7), bar * 4 + 0.35, 0.45)
    for at, note in ((6, 78), (14, 72), (22, 78)):
        loop.add(bell(hz(note), 4, 1.6), at, 0.14, 0.5)
    loop.add(band_noise(loop.length / SR, 100, 600, loop.rng) * 0.4, 0, 0.18)
    return loop.render(0.35, 3.0)


def winter() -> Signal:
    loop = Loop(72, 32, 6)
    progression = [(57, "min"), (53, "maj"), (60, "maj"), (55, "maj")] * 2
    for bar, (root, quality) in enumerate(progression):
        notes = chord(root + 12, quality) + [root + 24]
        for i, note in enumerate(notes + notes[::-1][1:3]):
            loop.add(bell(hz(note + 12), 2.5, 0.8), bar * 4 + i * 0.66, 0.14, -0.5 + i * 0.2)
        for note in chord(root - 12, quality):
            loop.add(strings(hz(note), loop.secs(4), 1.0), bar * 4, 0.12)
    wind = band_noise(loop.length / SR, 300, 1800, loop.rng)
    sweep = 0.5 + 0.5 * np.sin(2 * np.pi * np.arange(loop.length) / loop.length * 3)
    loop.add(wind * sweep * 0.5, 0, 0.2)
    return loop.render(0.4, 3.0)


def sorrow() -> Signal:
    loop = Loop(64, 32, 7)
    progression = [(62, "min"), (58, "maj"), (55, "min"), (57, "maj"), (62, "min"), (53, "maj"), (55, "min"), (57, "maj")]
    for bar, (root, quality) in enumerate(progression):
        for note in chord(root - 12, quality):
            loop.add(strings(hz(note), loop.secs(4), 0.8), bar * 4, 0.16)
        loop.add(strings(hz(root - 24), loop.secs(4), 0.8), bar * 4, 0.14)
    melody = [(0, 3, 74), (3, 1, 72), (4, 4, 70), (8, 2, 67), (10, 2, 69), (12, 4, 69), (16, 3, 74), (19, 1, 76), (20, 4, 77), (24, 2, 76), (26, 2, 74), (28, 4, 73)]
    for at, length, note in melody:
        loop.add(flute(hz(note), loop.secs(length), loop.rng), at, 0.24, 0.2)
    return loop.render(0.4, 2.8)


def triumph() -> Signal:
    loop = Loop(112, 32, 8)
    progression = [(60, "maj"), (65, "maj"), (67, "maj"), (60, "maj"), (57, "min"), (65, "maj"), (67, "maj"), (60, "maj")]
    for bar, (root, quality) in enumerate(progression):
        for note in chord(root - 12, quality):
            loop.add(strings(hz(note), loop.secs(4), 0.2), bar * 4, 0.14, -0.3)
        loop.add(drum(hz(root - 24), 1.0, 0.3, loop.rng, 0.2, 3.5), bar * 4, 0.5)
        loop.add(drum(hz(root - 17), 0.8, 0.3, loop.rng, 0.2, 3.5), bar * 4 + 2, 0.35)
        loop.add(bell(hz(root + 24), 2.0, 0.7), bar * 4, 0.1, 0.5)
    melody = [
        (0, 0.5, 72), (0.5, 0.5, 72), (1, 0.5, 72), (1.5, 0.5, 76), (2, 2, 79),
        (4, 1, 77), (5, 1, 76), (6, 2, 77),
        (8, 1, 79), (9, 1, 81), (10, 2, 83),
        (12, 3, 84),
        (16, 1, 81), (17, 1, 79), (18, 2, 76),
        (20, 1, 77), (21, 1, 81), (22, 2, 84),
        (24, 1, 83), (25, 1, 81), (26, 2, 79),
        (28, 3, 84),
    ]
    for at, length, note in melody:
        loop.add(brass(hz(note), loop.secs(length) * 0.95, 1.3), at, 0.3, 0.2)
        loop.add(brass(hz(note - 12), loop.secs(length) * 0.95, 1.0), at, 0.14, -0.2)
    loop.add(cymbal(3, loop.rng), 0, 0.14)
    return loop.render(0.25, 1.8)


MOODS: dict[str, Callable[[], Signal]] = {
    "overture": overture,
    "intrigue": intrigue,
    "feast": feast,
    "battle": battle,
    "dread": dread,
    "winter": winter,
    "sorrow": sorrow,
    "triumph": triumph,
}

# --- sound effects -----------------------------------------------------------------------------------


def sfx_curtain(rng: np.random.Generator) -> Signal:
    t = times(1.6)
    rustle = band_noise(1.6, 300, 5000, rng) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 7 * t)))
    return rustle * np.sin(np.pi * t / 1.6) ** 0.7


def sfx_gong(rng: np.random.Generator) -> Signal:
    t = times(4.5)
    out = np.zeros_like(t)
    for ratio, amp, d in ((1, 1, 0.6), (1.48, 0.7, 0.8), (2.1, 0.5, 1.1), (2.86, 0.4, 1.4), (3.53, 0.3, 1.8), (4.4, 0.2, 2.4)):
        out += amp * np.exp(-t * d) * np.sin(2 * np.pi * 98 * ratio * t + np.sin(2 * np.pi * 0.7 * t) * 0.4)
    return out * np.minimum(1, t / 0.05) + band_noise(4.5, 200, 4000, rng) * np.exp(-t * 20) * 0.3


def sfx_sword_draw(rng: np.random.Generator) -> Signal:
    t = times(1.0)
    scrape = band_noise(1.0, 2500, 9000, rng) * np.minimum(1, t / 0.05) * np.exp(-t * 3) * (t < 0.7)
    sweep = np.sin(2 * np.pi * np.cumsum(1400 + 1800 * t) / SR) * np.exp(-((t - 0.65) ** 2) / 0.02) * 0.6
    ring = bell(3200, 1.0, 0.25) * 0.4
    return scrape + sweep + np.concatenate([np.zeros(int(0.6 * SR)), ring[: len(t) - int(0.6 * SR)]])


def metal_hit(rng: np.random.Generator, base: float, seconds: float = 0.9) -> Signal:
    t = times(seconds)
    out = np.zeros_like(t)
    for ratio, amp, d in ((1, 1, 6), (1.47, 0.8, 7), (2.06, 0.6, 9), (2.89, 0.5, 11), (3.7, 0.35, 14)):
        out += amp * np.exp(-t * d) * np.sin(2 * np.pi * base * ratio * t)
    return out + band_noise(seconds, 2000, 12000, rng) * np.exp(-t * 60) * 0.8


def sfx_sword_clash(rng: np.random.Generator) -> Signal:
    first = metal_hit(rng, 1700)
    second = metal_hit(rng, 1900)
    gap = int(0.16 * SR)
    return first + np.concatenate([np.zeros(gap), second[:-gap]]) * 0.8


def sfx_shink(rng: np.random.Generator) -> Signal:
    t = times(0.8)
    zing = np.sin(2 * np.pi * np.cumsum(2800 + 4200 * np.minimum(1, t / 0.25)) / SR) * np.exp(-t * 5)
    hiss = band_noise(0.8, 5000, 14000, rng) * np.exp(-t * 14)
    return zing * 0.7 + hiss * 0.6


def sfx_thud(rng: np.random.Generator) -> Signal:
    t = times(0.7)
    body = np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-t * 18)) / SR) * np.exp(-t * 8)
    return body + lowpass(rng.standard_normal(len(t)), 400) * np.exp(-t * 25) * 0.6


def crowd(rng: np.random.Generator, seconds: float, shape: Callable[[Signal], Signal], vowel: tuple[float, ...]) -> Signal:
    t = times(seconds)
    out = np.zeros_like(t)
    for formant in vowel:
        out += band_noise(seconds, formant * 0.8, formant * 1.25, rng)
    murmur = 0.7 + 0.3 * np.sin(2 * np.pi * rng.uniform(3, 6) * t) * np.sin(2 * np.pi * 1.3 * t)
    return out * murmur * shape(t)


def sfx_crowd_gasp(rng: np.random.Generator) -> Signal:
    return crowd(rng, 1.2, lambda t: np.minimum(1, t / 0.06) * np.exp(-t * 3), (500, 1000, 2600))


def sfx_crowd_cheer(rng: np.random.Generator) -> Signal:
    cheer = crowd(rng, 2.8, lambda t: np.minimum(1, t / 0.25) * np.minimum(1, (2.8 - t) / 0.8), (750, 1150, 2500, 3400))
    for at in (0.3, 0.9, 1.5):
        start = int(at * SR)
        shout = voices([hz(62 + rng.integers(0, 7))], 0.5, (650, 1100, 2400)) * 0.15
        cheer[start : start + len(shout)] += shout[: len(cheer) - start]
    return cheer


def sfx_thunder(rng: np.random.Generator) -> Signal:
    t = times(4.0)
    crack = band_noise(4.0, 500, 9000, rng) * np.exp(-t * 9)
    rumble = lowpass(rng.standard_normal(len(t)), 160) * 8
    rumble *= np.minimum(1, t / 0.15) * np.exp(-t * 0.8) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 1.7 * t)))
    return crack * 0.7 + rumble


def sfx_wind(rng: np.random.Generator) -> Signal:
    t = times(3.0)
    howl = band_noise(3.0, 250, 1600, rng) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.6 * t)) * np.sin(np.pi * t / 3) ** 0.5
    whistle = np.sin(2 * np.pi * np.cumsum(700 + 250 * np.sin(2 * np.pi * 0.5 * t)) / SR) * 0.15 * np.sin(np.pi * t / 3)
    return howl + whistle


def sfx_fire_whoosh(rng: np.random.Generator) -> Signal:
    t = times(1.4)
    out = np.zeros_like(t)
    for i, (lo, hi) in enumerate(((150, 800), (400, 2000), (1000, 5000))):
        out += band_noise(1.4, lo, hi, rng) * np.exp(-((t - 0.25 - i * 0.12) ** 2) / 0.05)
    crackle = (rng.random(len(t)) > 0.9985) * rng.standard_normal(len(t)) * 0.5 * np.exp(-t * 2)
    return out + crackle


def sfx_goblet_clink(rng: np.random.Generator) -> Signal:
    t = times(1.2)
    out = np.zeros_like(t)
    for at in (0.0, 0.35):
        start = int(at * SR)
        glass = np.zeros(len(t) - start)
        tt = t[: len(glass)]
        for ratio, amp, d in ((1, 1, 5), (1.63, 0.6, 7), (2.42, 0.4, 9), (3.17, 0.25, 12)):
            glass += amp * np.exp(-tt * d) * np.sin(2 * np.pi * 2400 * ratio * tt)
        out[start:] += glass * (1 if at == 0 else 0.7)
    return out + band_noise(1.2, 4000, 12000, rng) * np.exp(-t * 80) * 0.3


def sfx_gulp(rng: np.random.Generator) -> Signal:
    t = times(0.9)
    out = np.zeros_like(t)
    for at in (0.0, 0.3, 0.6):
        start = int(at * SR)
        n = int(0.18 * SR)
        tt = t[:n]
        blip = np.sin(2 * np.pi * np.cumsum(260 - 600 * tt) / SR) * np.sin(np.pi * tt / 0.18)
        out[start : start + n] += blip
    return lowpass(out, 1200) + band_noise(0.9, 200, 900, rng) * 0.05


def sfx_bell_toll(rng: np.random.Generator) -> Signal:
    return bell(196, 4.5, 2.2) + band_noise(4.5, 1000, 5000, rng) * np.exp(-times(4.5) * 40) * 0.2


def sfx_horn(rng: np.random.Generator) -> Signal:
    t = times(2.4)
    note = brass(hz(50), 2.2, 0.8) * np.sin(np.pi * np.minimum(1, t[: int(2.2 * SR)] / 2.2)) ** 0.4
    growl = band_noise(2.2, 60, 300, rng) * 0.08
    return fit(note + growl, 2.4)


def sfx_raven(rng: np.random.Generator) -> Signal:
    out = np.zeros(int(1.1 * SR))
    for at in (0.0, 0.5):
        n = int(0.32 * SR)
        tt = times(0.32)
        pitch = 760 - 260 * tt / 0.32
        caw = np.zeros(n)
        phase = 2 * np.pi * np.cumsum(pitch) / SR
        for k in range(1, 12):
            caw += np.sin(k * phase) / k * np.exp(-(((k * pitch - 1500) / 700) ** 2))
        caw += band_noise(0.32, 800, 3000, rng) * 0.3
        start = int(at * SR)
        out[start : start + n] += caw * np.sin(np.pi * tt / 0.32) ** 0.5
    return out


def sfx_splash(rng: np.random.Generator) -> Signal:
    t = times(1.4)
    burst = band_noise(1.4, 400, 9000, rng) * np.minimum(1, t / 0.01) * np.exp(-t * 5)
    drops = np.zeros_like(t)
    for _ in range(18):
        start = int(rng.uniform(0.1, 1.1) * SR)
        n = int(0.04 * SR)
        f = rng.uniform(900, 2400)
        tt = times(0.04)
        drops[start : start + n] += np.sin(2 * np.pi * np.cumsum(f + 6000 * tt) / SR) * np.exp(-tt * 80) * 0.4
    return burst + drops


def sfx_dragon_roar(rng: np.random.Generator) -> Signal:
    t = times(2.8)
    pitch = 75 + 25 * np.sin(np.pi * t / 2.8) + 6 * rng.standard_normal(len(t)).cumsum() / np.sqrt(len(t))
    phase = 2 * np.pi * np.cumsum(pitch) / SR
    growl = sum(np.sin(k * phase) / k for k in range(1, 30))
    roar = lowpass(growl, 900) + band_noise(2.8, 200, 2500, rng) * 0.5
    return roar * np.minimum(1, t / 0.3) * np.minimum(1, (2.8 - t) / 0.9)


def sfx_heartbeat(rng: np.random.Generator) -> Signal:
    out = np.zeros(int(2.0 * SR))
    for beat in (0.0, 1.0):
        for offset, gain in ((0.0, 1.0), (0.24, 0.7)):
            thump = drum(50, 0.3, 0.6, rng, 0.05, 14) * gain
            start = int((beat + offset) * SR)
            out[start : start + len(thump)] += thump
    return lowpass(out, 300)


def sfx_choir(rng: np.random.Generator) -> Signal:
    return voices([hz(n) for n in (50, 57, 62, 65, 69)], 3.2)


SFX: dict[str, Callable[[np.random.Generator], Signal]] = {
    "curtain": sfx_curtain,
    "gong": sfx_gong,
    "sword_draw": sfx_sword_draw,
    "sword_clash": sfx_sword_clash,
    "shink": sfx_shink,
    "thud": sfx_thud,
    "crowd_gasp": sfx_crowd_gasp,
    "crowd_cheer": sfx_crowd_cheer,
    "thunder": sfx_thunder,
    "wind": sfx_wind,
    "fire_whoosh": sfx_fire_whoosh,
    "goblet_clink": sfx_goblet_clink,
    "gulp": sfx_gulp,
    "bell_toll": sfx_bell_toll,
    "horn": sfx_horn,
    "raven": sfx_raven,
    "splash": sfx_splash,
    "dragon_roar": sfx_dragon_roar,
    "heartbeat": sfx_heartbeat,
    "choir": sfx_choir,
}

# --- stingers ------------------------------------------------------------------------------------------


def place(out: Signal, signal: Signal, at: float, gain: float = 1.0) -> None:
    start = int(at * SR)
    end = min(len(out), start + len(signal))
    out[start:end] += signal[: end - start] * gain


def sting_curtain(rng: np.random.Generator) -> Signal:
    out = np.zeros(int(2.2 * SR))
    place(out, sfx_curtain(rng), 0.0, 0.8)
    for i in range(10):
        place(out, snare(0.1, rng, 0.5), 0.2 + i * 0.07, 0.15 + i * 0.03)
    place(out, cymbal(1.4, rng), 0.9, 0.5)
    return out


def sting_roll_call(rng: np.random.Generator) -> Signal:
    out = np.zeros(int(2.0 * SR))
    for i in range(16):
        place(out, snare(0.08, rng, 0.6), i * 0.05, 0.1 + i * 0.03)
    place(out, cymbal(1.2, rng), 0.82, 0.5)
    place(out, brass(hz(67), 0.18, 1.2), 0.82, 0.5)
    place(out, brass(hz(72), 0.8, 1.2), 1.02, 0.6)
    place(out, brass(hz(64), 0.8, 1.0), 1.02, 0.3)
    return out


def sting_elimination(rng: np.random.Generator) -> Signal:
    out = np.zeros(int(2.4 * SR))
    place(out, drum(hz(38), 1.5, 0.4, rng, 0.4, 3), 0.0, 0.9)
    for at, note, length in ((0.0, 50, 0.35), (0.4, 47, 0.35), (0.8, 43, 1.4)):
        place(out, brass(hz(note), length, 0.8), at, 0.5)
        place(out, brass(hz(note + 12), length, 0.9), at, 0.25)
    return out


def sting_coronation(rng: np.random.Generator) -> Signal:
    out = np.zeros(int(4.2 * SR))
    for i in range(20):
        place(out, drum(hz(36), 0.25, 0.2, rng, 0.2, 10), i * 0.06, 0.2 + i * 0.02)
    place(out, cymbal(3, rng), 1.2, 0.6)
    for at, note in ((1.2, 60), (1.4, 64), (1.6, 67), (1.8, 72)):
        place(out, brass(hz(note), 2.4 - (at - 1.2), 1.4), at, 0.35)
    for note in (84, 88, 91):
        place(out, bell(hz(note), 2.5, 1.0), 1.8, 0.15)
    place(out, drum(hz(36), 2.0, 0.3, rng, 0.3, 2), 1.2, 0.8)
    return out


STINGERS: dict[str, Callable[[np.random.Generator], Signal]] = {
    "curtain": sting_curtain,
    "roll_call": sting_roll_call,
    "elimination": sting_elimination,
    "coronation": sting_coronation,
}

# --- output --------------------------------------------------------------------------------------------


def finish(signal: Signal, peak: float = 0.85) -> Signal:
    signal = signal - np.mean(signal, axis=0)
    fade = min(len(signal), int(0.01 * SR))
    ramp = np.linspace(1, 0, fade)
    if signal.ndim == 1:
        signal[-fade:] *= ramp
    else:
        signal[-fade:] *= ramp[:, None]
    return signal / (np.max(np.abs(signal)) + 1e-9) * peak


def write(stem: str, signal: Signal, title: str) -> list[dict]:
    entries = []
    for ext, fmt, subtype, extra in (("ogg", "OGG", "OPUS", {}), ("mp3", "MP3", "MPEG_LAYER_III", {"compression_level": 0.6})):
        path = OUT / f"{stem}.{ext}"
        path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(path, signal.astype(np.float32), SR, format=fmt, subtype=subtype, **extra)
        entries.append(
            {
                "file": f"{stem}.{ext}",
                "title": title,
                "author": "The Bottle Throne (synthesized by scripts/gen_audio_assets.py)",
                "source_url": "",
                "license": "CC0-1.0",
                "attribution_required": False,
                "attribution_text": "",
            }
        )
    print(f"wrote {stem}")
    return entries


def main() -> None:
    manifest: list[dict] = []
    for mood, build in MOODS.items():
        manifest += write(f"music/{mood}", build(), f"{mood.title()} (mood loop)")
    for cue, build in SFX.items():
        rng = np.random.default_rng(sum(map(ord, cue)))
        manifest += write(f"sfx/{cue}", finish(reverb(build(rng), 0.8, 0.15, rng)), f"{cue.replace('_', ' ').title()} (sound effect)")
    for name, build in STINGERS.items():
        rng = np.random.default_rng(1000 + sum(map(ord, name)))
        manifest += write(f"stingers/{name}", finish(reverb(build(rng), 1.2, 0.2, rng)), f"{name.replace('_', ' ').title()} (stinger)")
    (OUT / "LICENSES.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(manifest)} files listed in LICENSES.json")


if __name__ == "__main__":
    main()
