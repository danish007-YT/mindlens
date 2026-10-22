#!/usr/bin/env python3
"""
Generate tiny synthetic WAV files with RAVDESS-like filenames for testing.

Creates short sine-wave files in `ml/sample_collected/`.
"""
import os
import math
import wave
import struct

OUT_DIR = os.path.join(os.path.dirname(__file__), 'sample_collected')
os.makedirs(OUT_DIR, exist_ok=True)

def write_sine(path, duration=1.0, sr=22050, freq=220.0, amp=0.2):
    n_samples = int(duration * sr)
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        for i in range(n_samples):
            t = i / sr
            v = amp * math.sin(2 * math.pi * freq * t)
            iv = int(max(-1.0, min(1.0, v)) * 32767)
            wf.writeframes(struct.pack('<h', iv))

def main():
    # RAVDESS-style example filenames: 03-01-06-01-02-01-12.wav
    # We will vary the 3rd field (emotion code): 03=happy, 04=sad
    samples = []
    for i in range(6):
        name = f"03-01-03-01-02-01-{10+i:02d}.wav"  # happy-like
        path = os.path.join(OUT_DIR, name)
        write_sine(path, duration=1.2, freq=300 + i*10)
        samples.append(path)
    for i in range(6):
        name = f"03-01-04-01-02-01-{20+i:02d}.wav"  # sad-like
        path = os.path.join(OUT_DIR, name)
        write_sine(path, duration=1.2, freq=160 + i*8)
        samples.append(path)
    print(f"Wrote {len(samples)} synthetic audio files to: {OUT_DIR}")

if __name__ == '__main__':
    main()
