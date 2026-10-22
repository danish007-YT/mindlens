import json
from collections import Counter

with open('batch_run/person_69_results.json') as f:
    results = json.load(f)

total = len(results)
detected = [r for r in results if 'score' in r]
no_face = [r for r in results if r.get('error') == 'no_face_detected']
other_err = [r for r in results if 'error' in r and r.get('error') != 'no_face_detected']
flagged = [r for r in detected if r.get('quality_flags')]

scores = [r['score'] for r in detected]
bands = Counter(r['band'] for r in detected)

print(f'Total images:        {total}')
print(f'Face detected:       {len(detected)} ({100*len(detected)/total:.0f}%)')
print(f'No face detected:    {len(no_face)}')
print(f'Other errors:        {len(other_err)}')
print(f'Quality-flagged:     {len(flagged)} (blurry / face too small)')
print()
if scores:
    print(f'Score range:  {min(scores)} - {max(scores)}')
    print(f'Mean score:   {sum(scores)/len(scores):.1f}')
    print(f'Median score: {sorted(scores)[len(scores)//2]}')
print()
print('Band distribution:')
for band in ['Minimal','Mild','Moderate','Elevated']:
    print(f'  {band:10s}: {bands.get(band,0)}')
print()
print('No-face files:', [r['file'] for r in no_face])
print()
print('Flagged files:')
for r in flagged:
    print(f'  {r["file"]}: {r["quality_flags"]}  (blur_var={r["blur_variance"]}, face_frac={r.get("face_area_fraction")})')
