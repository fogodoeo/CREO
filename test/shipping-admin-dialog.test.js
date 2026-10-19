'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const html = fs.readFileSync(path.join(__dirname, '../public/shipping.html'), 'utf8');

function fixture(verifyAdmin = async () => true) {
    const { document, Event } = parseHTML(html);
    const modal = document.getElementById('shipping-admin-modal');
    const input = document.getElementById('shipping-admin-password');
    const form = document.getElementById('shipping-admin-form');
    const calls = { opened: 0, closed: 0, focused: 0, pushed: 0, popped: 0, verified: 0, initialized: 0, admin: [] };
    let submit;
    form.addEventListener = (type, handler) => { if (type === 'submit') submit = handler; };
    modal.open = false;
    modal.showModal = () => { modal.open = true; calls.opened++; };
    modal.close = () => { modal.open = false; calls.closed++; };
    input.focus = () => calls.focused++;
    const history = {
        state: { creoShippingView: 'base' },
        replaceState(state) { this.state = state; }
    };
    const context = vm.createContext({
        document, URLSearchParams, history, MOBILE_SHIPPING_HISTORY: true,
        SHIPPING_CHANNEL_ID: 'isolated-channel',
        location: { search: '?channel=isolated-channel&archive=old-round', href: 'http://isolated.test/shipping.html' },
        pushMobileShippingView(view) { calls.pushed++; history.state = { creoShippingView: view }; },
        closeMobileShippingView() { calls.popped++; history.state = { creoShippingView: 'base' }; },
        openCompanySelectModal() {}, closeCompanySelectModal() {},
        setShippingAdminState(value) { calls.admin.push(value); },
        async initializeShipping() {
            assert.equal(modal.open, false, 'close the login dialog before opening company selection');
            assert.equal(history.state.creoShippingView, 'base');
            calls.initialized++;
        },
        CreoPlatform: {
            setAdmin() {},
            async verifyAdmin(password) { calls.verified++; return verifyAdmin(password); }
        }
    });
    const start = html.indexOf('let shippingLoginRequired = false;');
    const end = html.indexOf('        (async () => {', start);
    vm.runInContext(html.slice(start, end), context);
    return { document, Event, context, modal, input, history, calls,
        submit: () => submit({ preventDefault() {}, currentTarget: form }) };
}

test('optional login is a named dialog with cancellation, stable repeated opening, and one history close', () => {
    const f = fixture();
    assert.equal(f.modal.tagName, 'DIALOG');
    assert.equal(f.modal.getAttribute('aria-labelledby'), 'shipping-admin-title');
    assert.equal(f.document.getElementById('shipping-admin-error').getAttribute('role'), 'alert');
    f.context.openShippingAdminLogin();
    f.context.openShippingAdminLogin();
    assert.equal(f.calls.opened, 1);
    assert.equal(f.calls.pushed, 1);
    assert.equal(f.calls.focused, 1);
    assert.equal(f.document.getElementById('shipping-admin-cancel').hidden, false);
    f.input.value = 'isolated-password';
    const event = new f.Event('cancel', { cancelable: true });
    f.modal.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.modal.open, false);
    assert.equal(f.modal.hidden, true);
    assert.equal(f.input.value, '');
    assert.equal(f.calls.popped, 1);
    f.context.closeShippingAdminLogin();
    assert.equal(f.calls.popped, 1);
    f.context.openShippingAdminLogin();
    f.context.closeShippingAdminLogin(true);
    assert.equal(f.calls.popped, 1, 'browser Back must not move history a second time');
});

test('required login cannot reveal the protected screen through Escape, backdrop, or Back', () => {
    const f = fixture();
    f.context.openShippingAdminLogin({ required: true });
    assert.equal(f.document.getElementById('shipping-admin-cancel').hidden, true);
    const exit = f.document.getElementById('shipping-admin-exit');
    assert.equal(exit.hidden, false);
    assert.equal(exit.getAttribute('href'), '/main?channel=isolated-channel&archive=old-round');
    f.modal.dispatchEvent(new f.Event('cancel', { cancelable: true }));
    const escape = new f.Event('keydown', { cancelable: true });
    escape.key = 'Escape';
    f.modal.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    f.modal.click();
    f.context.closeShippingAdminLogin(true);
    assert.equal(f.modal.open, true);
    assert.equal(f.calls.closed, 0);
    assert.equal(f.calls.popped, 0);
    assert.equal(f.calls.initialized, 0);
});

test('failed login remains retryable and duplicate pending submits do not send a second request', async () => {
    let finish;
    const f = fixture(() => new Promise(resolve => { finish = resolve; }));
    f.context.openShippingAdminLogin();
    f.input.value = 'isolated-wrong';
    const first = f.submit();
    const button = f.document.querySelector('#shipping-admin-form button[type="submit"]');
    assert.equal(button.disabled, true);
    await f.submit();
    assert.equal(f.calls.verified, 1);
    finish(false);
    await first;
    assert.equal(f.modal.open, true);
    assert.equal(button.disabled, false);
    assert.match(f.document.getElementById('shipping-admin-error').textContent, /다시 시도/);
    assert.equal(f.calls.focused, 2);
    const retry = f.submit();
    finish(true);
    await retry;
    assert.equal(f.calls.verified, 2);
    assert.equal(f.modal.open, false);
    assert.equal(f.input.value, '');
    assert.equal(f.history.state.creoShippingView, 'base');
    assert.deepEqual(f.calls.admin, [true]);
});

test('successful required login closes its history before reinitializing the current round once', async () => {
    const f = fixture();
    vm.runInContext('shippingLoginRequired = true', f.context);
    f.context.openShippingAdminLogin({ required: true });
    f.input.value = 'isolated-valid';
    await f.submit();
    assert.equal(f.calls.initialized, 1);
    assert.equal(f.modal.hidden, true);
    assert.equal(f.modal.dataset.required, 'false');
    assert.equal(f.calls.popped, 0, 'an asynchronous Back cannot close the newly opened company picker');
    assert.equal(vm.runInContext('shippingLoginRequired', f.context), false);
});

test('cancelled optional login stays closed when a delayed network failure arrives', async () => {
    let fail;
    const f = fixture(() => new Promise((_, reject) => { fail = reject; }));
    f.context.openShippingAdminLogin();
    const pending = f.submit();
    f.document.getElementById('shipping-admin-cancel').click();
    const focused = f.calls.focused;
    fail(new Error('isolated network failure'));
    await pending;
    assert.equal(f.modal.open, false);
    assert.equal(f.calls.focused, focused);
    assert.equal(f.document.getElementById('shipping-admin-error').textContent, '');
    assert.equal(f.document.querySelector('#shipping-admin-form button[type="submit"]').disabled, false);
    assert.equal(f.calls.initialized, 0);
});
