/**
 * Safari-safe global error handler regression checks.
 * Run: node scripts/test_safari_global_error.js
 * Simulated DOM only; not a physical iPhone/WebKit test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const headScript = html.match(/<head>\s*<script>([\s\S]*?)<\/script>/i);
assert.ok(headScript, 'First inline head script must exist');
assert.ok(!headScript[1].includes('innerHTML'), 'Diagnostic handler must not interpolate raw error HTML');
assert.ok(!headScript[1].includes('[Global Javascript Error Detected]'), 'Blocking overlay must not reappear');

const logged = [];
const handlers = new Map();
function makeElement(tag) {
  const element = {
    tagName: tag.toUpperCase(), children: [], parentNode: null,
    attributes: {}, style: { cssText: '' }, textContent: '', id: '',
    addEventListener(type, callback) { this['on_' + type] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) {
      this.children.splice(this.children.indexOf(child), 1);
      child.parentNode = null;
    },
  };
  return element;
}
const body = makeElement('body');
const document = {
  body,
  createElement: makeElement,
  getElementById(id) {
    function find(node) {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    }
    return find(body);
  },
};
const window = {
  location: { href: 'https://preview.example.test/', hostname: 'preview.example.test', hash: '' },
  addEventListener(name, callback) {
    if (!handlers.has(name)) handlers.set(name, []);
    handlers.get(name).push(callback);
  },
};
const safeConsole = {
  warn(...parts) { logged.push(parts.join(' ')); },
  error(...parts) { logged.push(parts.join(' ')); },
};
vm.runInNewContext(headScript[1], { window, document, console: safeConsole, URL }, { timeout: 2000 });
assert.equal(typeof window.onerror, 'function');

// Opaque cross-origin Safari errors must not create an overlay or interrupt sharing.
assert.equal(window.onerror('Script error.', '', 0, 0, null), true);
assert.equal(document.getElementById('aether-global-err-toast'), null);
assert.ok(logged.some(item => item.includes('JS-OPAQUE')));

// Genuine runtime exception: one dismissible non-blocking toast with no raw payload.
const secret = 'access_token=my-internal-test-token';
window.onerror(secret, 'https://unpkg.com/demo.js?apikey=hidden', 14, 3, {
  name: 'TypeError', stack: 'SECRET_STACK_WITH_PRIVATE_INPUT',
});
const toast = document.getElementById('aether-global-err-toast');
assert.ok(toast, 'A non-blocking toast must be created');
assert.ok(!toast.style.cssText.includes('height:100%'), 'Toast must not block entire app');
assert.equal(toast.attributes.role, 'status');
assert.ok(toast.children[1].attributes['aria-label']);
assert.equal(typeof toast.children[1].on_click, 'function');
assert.ok(!toast.children[0].textContent.includes(secret), 'No user payload in toast');
assert.ok(!logged.join('\n').includes(secret), 'No user payload in logs');
assert.ok(!logged.join('\n').includes('SECRET_STACK'), 'No stack in logs');
assert.ok(!logged.join('\n').includes('hidden'), 'No URL query key in logs');

// Dismiss and recognize failed external script loading separately.
toast.children[1].on_click();
assert.equal(document.getElementById('aether-global-err-toast'), null);
const capture = handlers.get('error')[0];
capture({ target: { tagName: 'SCRIPT', src: 'https://cdnjs.cloudflare.com/ajax/libs/demo.js?token=privatevalue' } });
assert.ok(logged.some(item => item.includes('[CDN-LOAD]')));
assert.ok(!logged.join('\n').includes('privatevalue'));
assert.ok(document.getElementById('aether-global-err-toast'));

// Unhandled rejection is recorded only as a sanitized category.
handlers.get('unhandledrejection')[0]({
  reason: { message: 'password=SENSITIVE_TEST_PASSWORD' },
  preventDefault() { this.wasPrevented = true; },
});
assert.ok(logged.some(item => item.includes('[JS-PROMISE]')));
assert.ok(!logged.join('\n').includes('SENSITIVE_TEST_PASSWORD'));
console.log('PASS: Safari-safe error handling (opaque/runtime/load/rejection/privacy/dismissal)');
