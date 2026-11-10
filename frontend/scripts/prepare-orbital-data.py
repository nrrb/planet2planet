#!/usr/bin/env python3
"""Prepare all bodies atomically; sequential JPL requests, cached and offline modes."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
EPOCH = '2026-11-09T00:00:00Z'
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
PLANETS = 'https://ssd.jpl.nasa.gov/planets/phys_par.html'
SAT_PHYS = 'https://ssd.jpl.nasa.gov/sats/phys_par/'
SAT_ORBITS = 'https://ssd.jpl.nasa.gov/sats/elem/'
SUN_PHYS = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html'
# Rounded schematic inputs, not fitted ephemerides. Periods are positive days.
# name, Horizons body center, parent, mean radius km, orbital radius km, period, color
SEED = [
    ('Sun', '10', None, 695700, 0, 0, '#ffdc55'),
    ('Mercury', '199', 'sun', 2439.4, 57909050, 87.9691, '#a7a9ac'),
    ('Venus', '299', 'sun', 6051.8, 108208000, 224.701, '#ead7ae'),
    ('Earth', '399', 'sun', 6371.0084, 149598023, 365.256, '#4d9fff'),
    ('Mars', '499', 'sun', 3389.5, 227939200, 686.98, '#e77b51'),
    ('Jupiter', '599', 'sun', 69911, 778570000, 4332.59, '#d6b18d'),
    ('Saturn', '699', 'sun', 58232, 1433530000, 10759.22, '#ead19a'),
    ('Uranus', '799', 'sun', 25362, 2872460000, 30688.5, '#8bdfe1'),
    ('Neptune', '899', 'sun', 24622, 4495060000, 60182, '#557ce8'),
    ('Moon', '301', 'earth', 1737.4, 384400, 27.3217, '#c8cbd2'),
    ('Phobos', '401', 'mars', 11.08, 9376, 0.31891, '#b9a697'),
    ('Deimos', '402', 'mars', 6.2, 23463, 1.26244, '#bfae9d'),
    ('Io', '501', 'jupiter', 1821.49, 421800, 1.76914, '#e3c35d'),
    ('Europa', '502', 'jupiter', 1560.8, 671100, 3.55118, '#cfc1a7'),
    ('Ganymede', '503', 'jupiter', 2631.2, 1070400, 7.15455, '#a89d8d'),
    ('Callisto', '504', 'jupiter', 2410.3, 1882700, 16.689, '#8c8680'),
    ('Mimas', '601', 'saturn', 198.2, 185540, 0.94242, '#c3c5c8'),
    ('Enceladus', '602', 'saturn', 252.1, 238040, 1.37022, '#e3edf1'),
    ('Tethys', '603', 'saturn', 531.1, 294670, 1.8878, '#cdd4d6'),
    ('Dione', '604', 'saturn', 561.4, 377420, 2.73692, '#c4c7c2'),
    ('Rhea', '605', 'saturn', 763.5, 527070, 4.51821, '#bab8b2'),
    ('Titan', '606', 'saturn', 2574.76, 1221870, 15.9454, '#d9a956'),
    ('Iapetus', '608', 'saturn', 734.5, 3560840, 79.3215, '#9f9589'),
    ('Miranda', '705', 'uranus', 235.8, 129900, 1.41348, '#c2c4c6'),
    ('Ariel', '701', 'uranus', 578.9, 190900, 2.52038, '#d1d6d5'),
    ('Umbriel', '702', 'uranus', 584.7, 266000, 4.14418, '#85898f'),
    ('Titania', '703', 'uranus', 788.9, 436300, 8.70587, '#b7b4ad'),
    ('Oberon', '704', 'uranus', 761.4, 583500, 13.4632, '#a59c96'),
    ('Triton', '801', 'neptune', 1352.6, 354800, 5.87685, '#c8d4ce'),
    ('Nereid', '802', 'neptune', 170, 5513400, 360.136, '#a2a8b1'),
]


def seed_catalog():
    bodies = []
    for index, (name, hid, parent, radius, distance, period, color) in enumerate(SEED):
        body = dict(id=name.lower(), name=name, horizonsId=hid, parentId=parent,
                    radiusKm=radius, color=color,
                    sources=[SUN_PHYS] if parent is None else [PLANETS] if parent == 'sun' else [SAT_PHYS, SAT_ORBITS])
        if parent:
            body['orbit'] = dict(radiusKm=distance, periodDays=period,
                                 angleRad=(index * 2.3999632297) % math.tau,
                                 direction=-1 if name == 'Triton' else 1, epoch=EPOCH)
        bodies.append(body)
    return dict(generatedAt=EPOCH, epoch=EPOCH,
                frame='ICRF / J2000 ecliptic, parent-centered',
                units=dict(distance='km', period='days', angle='radians', time='UTC'),
                referenceKind='illustrative',
                provenance='Approximate seed: rounded NASA/JPL physical and mean orbital parameters; '
                'solar orbital radii are conventional rounded semi-major axes. Sun radius is the '
                'IAU nominal value. Angles use a deterministic golden-angle layout, NOT observations. '
                'Seed directions are schematic (+1 except Triton -1), NOT vector-derived. '
                'JPL API DNS was unavailable during preparation. Run live regeneration for projected directions and angles.',
                bodies=bodies)


def query_parameters(body, parent):
    return dict(format='json', COMMAND=f"'{body['horizonsId']}'", CENTER=f"'500@{parent['horizonsId']}'",
                EPHEM_TYPE="'VECTORS'", OBJ_DATA="'NO'", MAKE_EPHEM="'YES'",
                START_TIME="'2026-11-09 00:00'", STOP_TIME="'2026-11-10 00:00'", STEP_SIZE="'1 d'",
                OUT_UNITS="'KM-S'", REF_PLANE="'ECLIPTIC'", REF_SYSTEM="'ICRF'",
                VEC_TABLE="'2'", CSV_FORMAT="'YES'", VEC_CORR="'NONE'", TIME_TYPE="'UT'")


def parse_vector(response):
    if response.get('error'):
        raise ValueError(response['error'])
    result = response.get('result', '')
    if '$$SOE' not in result or '$$EOE' not in result:
        raise ValueError('missing Horizons vector block')
    row = result.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip().splitlines()[0]
    fields = row.split(',')
    jd = float(fields[0])
    if abs(jd - 2461353.5) > 0.00001:
        raise ValueError(f'unexpected reference epoch JD {jd}')
    x, y, z, vx, vy, vz = [float(v.replace('D', 'E')) for v in fields[2:8]]
    if not all(math.isfinite(v) for v in (x, y, z, vx, vy, vz)):
        raise ValueError('non-finite vector')
    momentum = x * vy - y * vx
    if math.hypot(x, y) == 0 or momentum == 0:
        raise ValueError('undefined projected angle/direction')
    return math.atan2(y, x), 1 if momentum > 0 else -1


def prepare(offline=False, cache_dir=ROOT / 'data-cache', contact=None):
    catalog = seed_catalog()
    by_id = {b['id']: b for b in catalog['bodies']}
    cache_dir.mkdir(parents=True, exist_ok=True)
    retrieved = []
    for body in catalog['bodies']:
        if not body['parentId']:
            continue
        params = query_parameters(body, by_id[body['parentId']])
        url = API + '?' + urllib.parse.urlencode(params)
        key = hashlib.sha256(url.encode()).hexdigest()[:16]
        cache = cache_dir / f"{body['id']}-{key}.json"
        if cache.exists():
            entry = json.loads(cache.read_text())
            if entry['request'] != params:
                raise ValueError(f'{cache.name}: inconsistent cached request')
            response = entry['response']
        elif offline:
            raise FileNotFoundError(f'Missing cached response: {cache.name}; run live preparation first or --seed')
        else:
            if not contact or '\n' in contact or '\r' in contact:
                raise ValueError('Live JPL requests require --contact with your email or contact URL (JPL fair-use policy)')
            print(f"Fetching {body['name']} relative to {body['parentId']}", flush=True)
            request = urllib.request.Request(url, headers={'User-Agent': f'Planet2PlanetData/0.1 ({contact})'})
            with urllib.request.urlopen(request, timeout=30) as request:
                response = json.load(request)
            parse_vector(response)  # Never cache API errors.
            entry = dict(request=params, response=response, retrievedAt=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'))
            cache.write_text(json.dumps(entry, indent=2) + '\n')
            time.sleep(1)  # JPL requests must be sequential.
        datetime.fromisoformat(entry['retrievedAt'].replace('Z', '+00:00'))
        retrieved.append(entry['retrievedAt'])
        angle, direction = parse_vector(response)
        body['orbit'].update(angleRad=angle, direction=direction)
        body['sources'].append('https://ssd-api.jpl.nasa.gov/doc/horizons.html')
    triton = next(b for b in catalog['bodies'] if b['id'] == 'triton')
    if triton['orbit']['direction'] != -1:
        raise ValueError('Triton projected direction was not retrograde; inspect source/frame')
    catalog['referenceKind'] = 'horizons'
    catalog['generatedAt'] = max(retrieved)
    # Stable generation metadata makes cache-only regeneration byte-for-byte repeatable.
    catalog['provenance'] = ('JPL Horizons geometric body-center vectors at the common UTC epoch; '
                             'reference angles atan2(y,x), directions sign(x*vy-y*vx). '
                             'Rounded mean radii and periods from the seed sources; circular projection remains approximate.')
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--offline', action='store_true', help='require cached Horizons responses')
    mode.add_argument('--seed', action='store_true', help='reproduce the explicitly illustrative fallback')
    parser.add_argument('--cache-dir', type=Path, default=ROOT / 'data-cache')
    parser.add_argument('--contact', help='your email or contact URL, required for uncached live requests')
    parser.add_argument('--output', type=Path, default=ROOT / 'src/data/bodies.json')
    args = parser.parse_args()
    try:
        catalog = seed_catalog() if args.seed else prepare(args.offline, args.cache_dir, args.contact)
        output = json.dumps(catalog, indent=2, allow_nan=False) + '\n'
        temp = args.output.with_suffix('.tmp')
        temp.write_text(output)
        temp.replace(args.output)  # All bodies succeed before replacing the bundled catalog.
    except (OSError, ValueError, KeyError, IndexError) as error:
        print(f'Preparation failed; catalog unchanged: {error}', file=sys.stderr)
        return 1
    print(f"Wrote {len(catalog['bodies'])} bodies ({catalog['referenceKind']}) to {args.output}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
