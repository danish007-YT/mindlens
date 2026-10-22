#!/usr/bin/env python3
"""
End-to-end pipeline: convert recorded media -> augment -> train

This orchestration script invokes the helper tools in this folder:
 - convert_webm.py  (ffmpeg must be installed)
 - augment.py       (pip install -r ml/requirements.txt)
 - train_*_model_TEMPLATE.py

Example:
  python ml/pipeline.py --collected /data/collected --work /data/work --augment-n 2 --train-audio --export-dir ../export

"""
import argparse
import glob
import os
import subprocess
import sys


def run(cmd):
    print("\n$", " ".join(cmd))
    subprocess.check_call(cmd)


def require_file(path, description):
    if not os.path.exists(path):
        print(f"ERROR: {description} not found: {path}")
        sys.exit(1)


def require_dir(path, description, glob_pattern=None):
    if not os.path.isdir(path):
        print(f"ERROR: {description} not found: {path}")
        sys.exit(1)
    if glob_pattern:
        matched = glob.glob(os.path.join(path, glob_pattern), recursive=True)
        if not matched:
            print(f"ERROR: {description} contains no matching files ({glob_pattern}): {path}")
            sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--collected', required=True, help='Folder with recorded webm/mp4 files and selfies')
    p.add_argument('--work', required=True, help='Working folder for converted/augmented files')
    p.add_argument('--augment-n', type=int, default=2, help='Augmentations per file')
    p.add_argument('--fps', type=float, default=1.0, help='Frames per second to extract')
    p.add_argument('--sr', type=int, default=22050, help='Sample rate for output wav')
    p.add_argument('--train-audio', action='store_true')
    p.add_argument('--audio-labels-csv', default=None,
                   help='Optional CSV for audio datasets with columns file,emotion. Useful for non-RAVDESS/CREMA-D corpora.')
    p.add_argument('--train-video', action='store_true')
    p.add_argument('--fer-csv', default='./fer2013.csv',
                   help='Path to FER2013 CSV for video training.')
    p.add_argument('--ferplus-csv', default=None,
                   help='Optional FERPlus soft-label CSV to improve FER2013 training.')
    p.add_argument('--video-extra-probs-csv', default=None,
                   help='Optional extra expression-probability CSV for cross-corpus video training. See ml/DATASETS.md.')
    p.add_argument('--train-text', action='store_true')
    p.add_argument('--export-dir', default='../export', help='Export directory for model JSONs (relative to ml/)')
    args = p.parse_args()

    collected = os.path.abspath(args.collected)
    work = os.path.abspath(args.work)
    wav_out = os.path.join(work, 'wav')
    frames_out = os.path.join(work, 'frames')
    aug_wav = os.path.join(work, 'aug_wav')
    aug_img = os.path.join(work, 'aug_img')

    os.makedirs(work, exist_ok=True)

    # 1) Convert recordings to WAV + extract frames
    print('Step 1: convert recordings to WAV and extract frames')
    run([sys.executable, 'ml/convert_webm.py', '--input', collected, '--audio-out', wav_out, '--frames-out', frames_out, '--fps', str(args.fps), '--sr', str(args.sr)])

    # 2) Augment audio and images
    print('\nStep 2: augment audio and images')
    run([sys.executable, 'ml/augment.py', '--input', wav_out, '--output', aug_wav, '--type', 'audio', '--nper', str(args.augment_n)])
    # images (frames)
    run([sys.executable, 'ml/augment.py', '--input', frames_out, '--output', aug_img, '--type', 'image', '--nper', str(args.augment_n)])

    # 3) Train models (optional)
    export_dir = os.path.abspath(args.export_dir)
    if args.train_audio:
        print('\nStep 3: train audio model')
        require_dir(aug_wav, 'augmented audio directory', '*.wav')
        if args.audio_labels_csv:
            require_file(args.audio_labels_csv, 'audio labels CSV')
        cmd = [sys.executable, 'ml/train_audio_model_TEMPLATE.py', '--input-dir', aug_wav, '--export', os.path.join(export_dir, 'audio_model.json')]
        if args.audio_labels_csv:
            cmd += ['--labels-csv', args.audio_labels_csv]
        run(cmd)

    if args.train_video:
        print('\nStep 3: train video model (FER style)')
        require_file(args.fer_csv, 'FER2013 CSV')
        if args.ferplus_csv:
            require_file(args.ferplus_csv, 'FERPlus CSV')
        if args.video_extra_probs_csv:
            require_file(args.video_extra_probs_csv, 'video extra probabilities CSV')
        cmd = [sys.executable, 'ml/train_video_model_TEMPLATE.py', '--fer-csv', args.fer_csv, '--export', os.path.join(export_dir, 'video_model.json')]
        if args.ferplus_csv:
            cmd += ['--ferplus-csv', args.ferplus_csv]
        if args.video_extra_probs_csv:
            cmd += ['--extra-probs-csv', args.video_extra_probs_csv]
        run(cmd)

    if args.train_text:
        print('\nStep 3: train text model')
        require_dir(os.path.join('ml','data'), 'text data directory', '*.csv')
        run([sys.executable, 'ml/train_text_model.py', '--data-dir', os.path.join('ml','data'), '--export-dir', export_dir])

    print('\nPipeline finished. Exported models (if requested) are under:', export_dir)


if __name__ == '__main__':
    main()
