'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

assert.match(css, /\.modal-overlay,\s*\.modal-backdrop\s*\{/);
assert.match(css, /\.modal-backdrop\.is-open/);
assert.match(app, /forcePwaUpdate\(\)\s*\{[\s\S]*?const editingStatus = this\.isUserEditingData\(\);[\s\S]*?return false;/);
assert.match(app, /addEventListener\('beforeunload',[\s\S]*?this\.isUserEditingData\(\)[\s\S]*?event\.returnValue = ''/);
assert.match(app, /initPwaInstallPrompt\(\)\s*\{[\s\S]*?this\.closeAllPwaModals\(\);/);
assert.match(app, /openIosPwaModal\(\)\s*\{\s*this\.closeAllPwaModals\('ios-pwa-modal'\)/);
assert.match(app, /openAndroidPwaModal\(\)\s*\{\s*this\.closeAllPwaModals\('android-pwa-modal'\)/);
assert.match(app, /openDesktopPwaModal\(\)\s*\{\s*this\.closeAllPwaModals\('desktop-pwa-modal'\)/);
assert.doesNotMatch(html, /무시하고 업데이트/);
assert.match(html, /미저장 변경사항이 있을 때는 업데이트할 수 없습니다/);
assert.match(html, /확인 \(작업 계속\)/);
assert.equal((html.match(/class="modal-backdrop" style="display: none;" aria-hidden="true"/g) || []).length, 4);
assert.match(sw, /const CACHE_VERSION = 'aetherpmo-v1\.6\.[4-9]-\d{8}-[a-z0-9-]+'/);

console.log('PASS: PWA modals are exclusive overlays and update reload is blocked while user input is unsaved.');
