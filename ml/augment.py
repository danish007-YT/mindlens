#!/usr/bin/env python3
"""
Simple augmentation script for audio and images.

Usage examples:
  pip install -r ml/requirements.txt
  python ml/augment.py --input /path/to/raw --output /path/to/augmented --type both --nper 3

This script applies conservative transforms (pitch shift, time-stretch,
additive noise for audio; flip/brightness/crop for images) to expand
your training set for experimentation. Do not use synthetic data to
cover for missing diverse real samples — collect real, consented data.
"""

import argparse
import os
import glob
import random

import numpy as np  # type: ignore[import]
from PIL import Image, ImageEnhance  # type: ignore[import]

try:
    import librosa  # type: ignore[import]
    import soundfile as sf  # type: ignore[import]
except Exception:
    librosa = None
    sf = None


def add_noise(y, snr_db=20):
    rms = np.sqrt(np.mean(y ** 2))
    if rms <= 0:
        return y
    snr = 10 ** (snr_db / 20.0)
    noise_rms = rms / snr
    noise = np.random.normal(0, noise_rms, y.shape[0])
    return y + noise


def augment_audio_file(path, outdir, n):
    if librosa is None or sf is None:
        print('librosa/soundfile not installed; skipping audio augmentation')
        return
    y, sr = librosa.load(path, sr=None)
    base = os.path.splitext(os.path.basename(path))[0]
    for i in range(n):
        y2 = y.copy()
        op = random.choice(['pitch', 'stretch', 'noise'])
        if op == 'pitch':
            n_steps = random.uniform(-2.0, 2.0)
            try:
                y2 = librosa.effects.pitch_shift(y2, sr, n_steps)
            except Exception:
                pass
        elif op == 'stretch':
            rate = random.uniform(0.92, 1.08)
            try:
                # time_stretch requires fairly long signals
                y2 = librosa.effects.time_stretch(y2, rate)
            except Exception:
                pass
        elif op == 'noise':
            snr = random.uniform(10, 25)
            y2 = add_noise(y2, snr)
        outpath = os.path.join(outdir, f"{base}_aug{i+1}.wav")
        sf.write(outpath, y2, sr, subtype='PCM_16')
        print('Wrote', outpath)


def augment_image_file(path, outdir, n):
    img = Image.open(path).convert('RGB')
    base = os.path.splitext(os.path.basename(path))[0]
    for i in range(n):
        im = img.copy()
        op = random.choice(['flip', 'bright', 'crop'])
        if op == 'flip':
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        elif op == 'bright':
            fac = random.uniform(0.85, 1.15)
            im = ImageEnhance.Brightness(im).enhance(fac)
        elif op == 'crop':
            w, h = im.size
            cw = int(w * random.uniform(0.88, 0.98))
            ch = int(h * random.uniform(0.88, 0.98))
            left = random.randint(0, w - cw)
            top = random.randint(0, h - ch)
            im = im.crop((left, top, left + cw, top + ch)).resize((w, h))
        outpath = os.path.join(outdir, f"{base}_aug{i+1}.jpg")
        im.save(outpath, quality=90)
        print('Wrote', outpath)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--type', choices=['audio', 'image', 'both'], default='both')
    p.add_argument('-n', '--nper', type=int, default=2)
    args = p.parse_args()

    os.makedirs(args.output, exist_ok=True)

    if args.type in ('audio', 'both'):
        audio_exts = ['*.wav', '*.webm', '*.mp3']
        files = []
        for ext in audio_exts:
            files += glob.glob(os.path.join(args.input, ext))
        for f in files:
            augment_audio_file(f, args.output, args.nper)

    if args.type in ('image', 'both'):
        img_exts = ['*.png', '*.jpg', '*.jpeg']
        files = []
        for ext in img_exts:
            files += glob.glob(os.path.join(args.input, ext))
        for f in files:
            augment_image_file(f, args.output, args.nper)


if __name__ == '__main__':
    main()
