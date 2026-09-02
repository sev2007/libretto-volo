import json
import re
from pathlib import Path
from PIL import Image
import yaml

ROOT = Path(__file__).resolve().parents[1]

manifest = json.loads((ROOT / 'manifest.webmanifest').read_text())
assert manifest['display'] == 'standalone'
assert manifest['start_url'] == './'
for icon in manifest['icons']:
    path = ROOT / icon['src'].removeprefix('./')
    assert path.is_file(), path
    size = tuple(map(int, icon['sizes'].split('x')))
    assert Image.open(path).size == size

service_worker = (ROOT / 'service-worker.js').read_text()
match = re.search(r'const APP_SHELL = \[(.*?)\];', service_worker, re.S)
assert match
for item in re.findall(r"'([^']+)'", match.group(1)):
    if item == './':
        continue
    path = ROOT / item.removeprefix('./')
    assert path.is_file(), path

workflow = yaml.safe_load((ROOT / '.github/workflows/pages.yml').read_text())
assert 'jobs' in workflow and 'deploy' in workflow['jobs']

config = (ROOT / 'config.js').read_text()
assert 'service_role' not in config
assert 'sb_secret_' not in config

database_source = (ROOT / 'src/db.js').read_text()
assert "const DB_VERSION = 2" in database_source
assert "createObjectStore('openingBalance'" in database_source

schema = (ROOT / 'supabase/migrations/001_initial_schema.sql').read_text()
for expected in [
    'create table if not exists public.opening_balances',
    'total_minutes integer not null default 47077',
    'day_landings integer not null default 1455',
    'pic_minutes integer not null default 40949',
    'dual_minutes integer not null default 5529',
    'instructor_minutes integer not null default 599',
]:
    assert expected in schema

for forbidden in ['.sqlite', '.db']:
    assert not list(ROOT.rglob(f'*{forbidden}'))

print('Manifest, cache PWA, workflow e assenza dati/segreti verificati.')
