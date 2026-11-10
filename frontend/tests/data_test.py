import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'scripts/prepare-orbital-data.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PreparationTests(unittest.TestCase):
    def test_seed_is_reproducible_and_complete(self):
        checked_in = json.loads((ROOT / 'src/data/bodies.json').read_text())
        if checked_in['referenceKind'] == 'illustrative':
            self.assertEqual(prepare.seed_catalog(), checked_in)
        self.assertEqual(len(prepare.SEED), 30)

    def test_vectors_derive_angle_direction_and_reject_unknown_input(self):
        vector = {'result': '$$SOE\n2461353.500000000, A.D. 2026-Nov-09, 0, 10, 0, 1, 0, 0,\n$$EOE'}
        angle, direction = prepare.parse_vector(vector)
        self.assertAlmostEqual(angle, prepare.math.pi / 2)
        self.assertEqual(direction, -1)
        for bad in [{'error': 'unknown body'}, {'result': 'no ephemeris'}, {'result': vector['result'].replace('2461353.5', '2451544.5')}, {'result': vector['result'].replace('0, 10', '0, NaN')}]:
            with self.assertRaises(ValueError):
                prepare.parse_vector(bad)

    def test_offline_missing_cache_fails_without_inventing_vectors(self):
        with tempfile.TemporaryDirectory() as cache:
            with self.assertRaises(FileNotFoundError):
                prepare.prepare(offline=True, cache_dir=Path(cache))

    def test_full_offline_cache_regeneration_and_center_parameters(self):
        catalog = prepare.seed_catalog()
        by_id = {b['id']: b for b in catalog['bodies']}
        with tempfile.TemporaryDirectory() as cache:
            for body in catalog['bodies']:
                if not body['parentId']:
                    continue
                params = prepare.query_parameters(body, by_id[body['parentId']])
                self.assertEqual(params['CENTER'], f"'500@{by_id[body['parentId']]['horizonsId']}'")
                self.assertEqual(params['TIME_TYPE'], "'UT'")
                url = prepare.API + '?' + prepare.urllib.parse.urlencode(params)
                key = prepare.hashlib.sha256(url.encode()).hexdigest()[:16]
                vy = -1 if body['id'] == 'triton' else 1
                response = {'result': f'$$SOE\n2461353.5, A.D. 2026-Nov-09, 10, 0, 0, 0, {vy}, 0,\n$$EOE'}
                entry = dict(request=params, response=response, retrievedAt=prepare.EPOCH)
                (Path(cache) / f"{body['id']}-{key}.json").write_text(json.dumps(entry))
            result = prepare.prepare(offline=True, cache_dir=Path(cache))
            self.assertEqual(result['referenceKind'], 'horizons')
            self.assertEqual(result, prepare.prepare(offline=True, cache_dir=Path(cache)))
            self.assertEqual(next(b for b in result['bodies'] if b['id'] == 'triton')['orbit']['direction'], -1)
