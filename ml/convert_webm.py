#!/usr/bin/env python3
"""
Convert recorded `.webm` files to `.wav` and optionally extract frames.

This script requires `ffmpeg` available on PATH. It calls ffmpeg via
subprocess for reliable, fast conversion with no heavy Python deps.

Example:
  python ml/convert_webm.py --input /path/to/collected --audio-out /out/wav --frames-out /out/frames --fps 1 --sr 22050

"""
import argparse
import os
import subprocess
import glob


def find_ffmpeg():
    for cmd in ("ffmpeg", "ffmpeg.exe"):
        try:
            subprocess.run([cmd, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return cmd
        except Exception:
            continue
    return None


def convert_audio(ffmpeg_cmd, src, dst_wav, sr=22050):
    os.makedirs(os.path.dirname(dst_wav), exist_ok=True)
    cmd = [ffmpeg_cmd, '-y', '-i', src, '-ar', str(sr), '-ac', '1', dst_wav]
    subprocess.check_call(cmd)


def extract_frames(ffmpeg_cmd, src, out_dir, fps=1):
    os.makedirs(out_dir, exist_ok=True)
    # output pattern: frame_0001.jpg
    out_pattern = os.path.join(out_dir, 'frame_%04d.jpg')
    cmd = [ffmpeg_cmd, '-y', '-i', src, '-vf', f'fps={fps}', out_pattern]
    subprocess.check_call(cmd)


def main():
    p = argparse.ArgumentParser(description='Convert webm recordings to wav + extract frames')
    p.add_argument('--input', required=True, help='Directory with .webm files')
    p.add_argument('--audio-out', default=None, help='Directory to write .wav files')
    p.add_argument('--frames-out', default=None, help='Directory to write extracted frames (subdirs per video)')
    p.add_argument('--fps', type=float, default=1.0, help='Frames per second to extract')
    p.add_argument('--sr', type=int, default=22050, help='Sample rate for output wav')
    args = p.parse_args()

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print('ffmpeg not found on PATH — please install ffmpeg and try again: https://ffmpeg.org')
        return

    files = glob.glob(os.path.join(args.input, '*.webm')) + glob.glob(os.path.join(args.input, '*.mp4'))
    print(f'Found {len(files)} input media files in {args.input}')
    if not files:
        return

    for f in files:
        base = os.path.splitext(os.path.basename(f))[0]
        if args.audio_out:
            out_wav = os.path.join(args.audio_out, f'{base}.wav')
            print('Converting audio:', f, '->', out_wav)
            convert_audio(ffmpeg, f, out_wav, sr=args.sr)
        if args.frames_out:
            out_dir = os.path.join(args.frames_out, base)
            print('Extracting frames from:', f, '->', out_dir)
            extract_frames(ffmpeg, f, out_dir, fps=args.fps)


if __name__ == '__main__':
    main()
