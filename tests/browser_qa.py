import json
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa-output'
OUT.mkdir(exist_ok=True)

report = {
    'initialDatabaseEmpty': False,
    'openingBalanceStored': False,
    'openingBalanceSurvivesArchiveClear': False,
    'legacyOpeningBalanceMigrated': False,
    'flightCreated': False,
    'dualRuleApplied': False,
    'flightDeletedToTrash': False,
    'offlineReloadWorks': False,
    'duplicateProtectionIncludesTrash': False,
    'consoleErrors': [],
    'pageErrors': [],
}

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
    launch_options = {
        'headless': True,
        'args': ['--no-sandbox', '--disable-dev-shm-usage'],
    }
    if executable:
        launch_options['executable_path'] = executable
    browser = p.chromium.launch(**launch_options)
    context = browser.new_context(viewport={'width': 1440, 'height': 1200}, locale='it-IT')
    page = context.new_page()
    page.on('console', lambda msg: report['consoleErrors'].append(msg.text) if msg.type == 'error' else None)
    page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))

    page.goto('http://127.0.0.1:4173/', wait_until='networkidle')
    page.wait_for_function('window.__LIBRETTO_QA__ !== undefined')
    report['initialDatabaseEmpty'] = (
        page.locator('#summary-flights').inner_text().strip() == '0'
        and 'vuoto' in page.locator('#empty-state h3').inner_text().lower()
    )
    opening_balance = page.evaluate("""async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('LibrettoVoloPWA');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return await new Promise((resolve, reject) => {
        const request = db.transaction('openingBalance', 'readonly').objectStore('openingBalance').get('main');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }""")
    assert opening_balance['totalMinutes'] == 784 * 60 + 37
    assert opening_balance['dayLandings'] == 1455
    assert opening_balance['picMinutes'] == 682 * 60 + 29
    assert opening_balance['dualMinutes'] == 92 * 60 + 9
    assert opening_balance['instructorMinutes'] == 9 * 60 + 59
    assert page.locator('#summary-time').inner_text().strip() == '784:37'
    report['openingBalanceStored'] = True
    page.screenshot(path=str(OUT / 'dashboard-vuoto.png'), full_page=True)

    page.evaluate('navigator.serviceWorker.ready')
    page.reload(wait_until='networkidle')
    assert page.evaluate('Boolean(navigator.serviceWorker.controller)')
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.__LIBRETTO_QA__ !== undefined')
    assert page.locator('#summary-flights').inner_text().strip() == '0'
    assert page.locator('#summary-time').inner_text().strip() == '784:37'
    report['offlineReloadWorks'] = True
    context.set_offline(False)

    page.locator('#new-flight-button').click()
    page.locator('#flight-dialog').wait_for(state='visible')
    page.locator('#flight-date').fill('2026-09-01')
    page.locator('#departure-time').fill('10:00')
    page.locator('#arrival-time').fill('11:25')
    page.locator('#departure-place').fill('LILB')
    page.locator('#arrival-place').fill('LIDT')
    page.locator('#day-landings').fill('1')
    page.locator('#remarks').fill('Volo test browser')
    assert page.locator('#pic-time').input_value() == '1:25'
    page.locator('#save-flight-button').click()
    page.locator('#flight-dialog').wait_for(state='hidden')
    page.wait_for_function("document.querySelector('#summary-flights').textContent.trim() === '1'")
    report['flightCreated'] = True

    page.locator('[data-action="edit"]').first.click()
    page.locator('#flight-dialog').wait_for(state='visible')
    assert page.locator('#pic-time').input_value() == '1:25'
    page.locator('input[name="primaryRole"][value="DUAL"]').check()
    assert page.locator('input[name="primaryRole"][value="DUAL"]').is_checked()
    assert not page.locator('input[name="primaryRole"][value="PIC"]').is_checked()
    pic_value = page.locator('#pic-time').input_value()
    dual_value = page.locator('#dual-time').input_value()
    page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / 'modifica-dual.png'), full_page=True)
    assert pic_value == '0:00', pic_value
    assert dual_value == '1:25', dual_value
    page.locator('#save-flight-button').click()
    page.locator('#flight-dialog').wait_for(state='hidden')
    state = page.evaluate('window.__LIBRETTO_QA__.getState()')
    active = [item for item in state['flights'] if not item.get('deletedAt')]
    assert len(active) == 1
    assert active[0]['picMinutes'] == 0
    assert active[0]['dualMinutes'] == 85
    report['dualRuleApplied'] = True

    page.locator('[data-action="delete"]').first.click()
    page.locator('#confirm-dialog').wait_for(state='visible')
    page.locator('#confirm-accept').click()
    page.locator('#confirm-dialog').wait_for(state='hidden')
    page.wait_for_function("document.querySelector('#summary-flights').textContent.trim() === '0'")
    state = page.evaluate('window.__LIBRETTO_QA__.getState()')
    assert len(state['flights']) == 1
    assert state['flights'][0].get('deletedAt')
    report['flightDeletedToTrash'] = True

    page.locator('#new-flight-button').click()
    page.locator('#flight-dialog').wait_for(state='visible')
    page.locator('#flight-date').fill('2026-09-01')
    page.locator('#departure-time').fill('10:00')
    page.locator('#arrival-time').fill('11:25')
    page.locator('#departure-place').fill('LILB')
    page.locator('#arrival-place').fill('LIDT')
    page.locator('#save-flight-button').click()
    page.locator('#flight-form-error').wait_for(state='visible')
    assert 'cestino' in page.locator('#flight-form-error').inner_text().lower()
    report['duplicateProtectionIncludesTrash'] = True
    page.locator('[data-close-dialog="flight-dialog"]').first.click()

    page.locator('#trash-button').click()
    page.locator('#trash-dialog').wait_for(state='visible')
    assert page.locator('#trash-content').inner_text().strip()
    page.locator('[data-close-dialog="trash-dialog"]').last.click()

    # Ensure blank Supabase settings can be saved without errors.
    page.locator('#settings-button').click()
    page.locator('#settings-dialog').wait_for(state='visible')
    assert page.locator('#setting-base-total').input_value() == '784:37'
    assert page.locator('#setting-base-landings').input_value() == '1455'
    assert page.locator('#setting-base-pic').input_value() == '682:29'
    assert page.locator('#setting-base-dual').input_value() == '92:09'
    assert page.locator('#setting-base-instructor').input_value() == '9:59'
    page.screenshot(path=str(OUT / 'impostazioni-saldo-iniziale.png'), full_page=True)
    page.locator('#setting-supabase-url').fill('')
    page.locator('#setting-supabase-key').fill('')
    page.locator('#settings-form button[type="submit"]').click()
    page.locator('#settings-dialog').wait_for(state='hidden')

    page.locator('#settings-button').click()
    page.locator('#settings-dialog').wait_for(state='visible')
    page.locator('#clear-database-button').click()
    page.locator('#confirm-dialog').wait_for(state='visible')
    page.locator('#confirm-accept').click()
    page.locator('#confirm-dialog').wait_for(state='hidden')
    page.locator('#settings-dialog').wait_for(state='hidden')
    state = page.evaluate('window.__LIBRETTO_QA__.getState()')
    assert state['flights'] == []
    assert state['openingBalance']['totalMinutes'] == 784 * 60 + 37
    assert state['openingBalance']['dayLandings'] == 1455
    report['openingBalanceSurvivesArchiveClear'] = True

    # Mobile visual check in a fresh isolated context.
    mobile = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        locale='it-IT',
    )
    mobile_page = mobile.new_page()
    mobile_page.on('pageerror', lambda error: report['pageErrors'].append(f'mobile: {error}'))
    mobile_page.goto('http://127.0.0.1:4173/', wait_until='networkidle')
    mobile_page.wait_for_function('window.__LIBRETTO_QA__ !== undefined')
    mobile_page.locator('#new-flight-button').click()
    mobile_page.locator('#flight-dialog').wait_for(state='visible')
    mobile_page.screenshot(path=str(OUT / 'inserimento-mobile.png'), full_page=True)
    mobile.close()

    # Upgrade path from v1.0.0, where the opening values lived in settings.
    legacy = browser.new_context(viewport={'width': 1200, 'height': 900}, locale='it-IT')
    legacy_page = legacy.new_page()
    legacy_page.goto('http://127.0.0.1:4173/manifest.webmanifest', wait_until='domcontentloaded')
    legacy_page.evaluate("""async () => {
      await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase('LibrettoVoloPWA');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('LibrettoVoloPWA', 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          database.createObjectStore('flights', { keyPath: 'id' });
          database.createObjectStore('imports', { keyPath: 'id' });
          database.createObjectStore('settings', { keyPath: 'key' });
          database.createObjectStore('deleteQueue', { keyPath: 'queueId' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.objectStore('settings').put({
          key: 'main',
          value: {
            pilotName: 'Walter Mondani',
            aircraftModel: 'RV-7',
            registration: 'I-DAVE',
            supabaseUrl: '',
            supabaseKey: '',
            baseTotalMinutes: 47077,
            baseDayLandings: 1455,
            basePicMinutes: 40949,
            baseDualMinutes: 5529,
            baseInstructorMinutes: 599
          }
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }""")
    legacy_page.goto('http://127.0.0.1:4173/', wait_until='networkidle')
    legacy_page.wait_for_function('window.__LIBRETTO_QA__ !== undefined')
    migrated = legacy_page.evaluate('window.__LIBRETTO_QA__.getState()')
    assert migrated['flights'] == []
    assert migrated['openingBalance']['totalMinutes'] == 47077
    assert migrated['openingBalance']['dayLandings'] == 1455
    assert migrated['openingBalance']['picMinutes'] == 40949
    assert migrated['openingBalance']['dualMinutes'] == 5529
    assert migrated['openingBalance']['instructorMinutes'] == 599
    report['legacyOpeningBalanceMigrated'] = True
    legacy.close()

    context.close()
    browser.close()

if report['consoleErrors'] or report['pageErrors']:
    raise AssertionError(json.dumps(report, indent=2, ensure_ascii=False))

(OUT / 'browser-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, indent=2, ensure_ascii=False))
