const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'frontend', 'js', 'local-store.js'),
    'utf8'
);

class MemoryStorage {
    #values = new Map();

    getItem(key) {
        return this.#values.has(key) ? this.#values.get(key) : null;
    }

    setItem(key, value) {
        this.#values.set(key, String(value));
    }

    removeItem(key) {
        this.#values.delete(key);
    }
}

function createStore() {
    const window = {
        localStorage: new MemoryStorage(),
        sessionStorage: new MemoryStorage(),
        crypto: webcrypto,
        btoa: value => Buffer.from(value, 'binary').toString('base64'),
        atob: value => Buffer.from(value, 'base64').toString('binary'),
        location: { origin: 'https://pos.test' }
    };
    const context = { window, TextEncoder, URL };
    vm.runInNewContext(source, context, { filename: 'local-store.js' });
    return window.MRBLocalStore;
}

async function createAccount(store) {
    await store.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
            user_id: 'owner-1',
            name: 'Store Owner',
            email: 'owner@example.test',
            contact_number: '09123456789',
            password: 'Password1!'
        })
    });
}

test('registers a local account, authenticates it, and clears login on logout', async () => {
    const store = createStore();
    assert.equal((await store.request('/auth/account-exists')).exists, false);
    await createAccount(store);
    assert.equal((await store.request('/auth/account-exists')).exists, true);
    assert.equal((await store.request('/auth/user-ids')).user_ids[0], 'owner-1');
    assert.equal((await store.request('/auth/me')).user.user_id, 'owner-1');
    await store.request('/auth/logout', { method: 'POST' });
    assert.equal((await store.request('/auth/me')).user, null);
    await assert.rejects(
        store.request('/products'),
        error => error.status === 401
    );
});

test('saves products and sales locally and updates stock and dashboard totals', async () => {
    const store = createStore();
    await createAccount(store);
    await store.request('/products', {
        method: 'POST',
        body: JSON.stringify({
            name: 'Coffee',
            sku: 'COF-01',
            category: 'Drinks',
            price: '12.50',
            stock: 5,
            threshold: 1
        })
    });
    const result = await store.request('/transactions', {
        method: 'POST',
        body: JSON.stringify({
            items: [{ product_id: 'COF-01', quantity: 2 }],
            payment_type: 'full',
            payment_method: 'Cash',
            cash_received: '30.00',
            paid_amount: '0',
            customer_name: '',
            customer_contact: ''
        })
    });
    assert.equal(result.transaction.total, '25.00');
    assert.equal(result.transaction.change, '5.00');
    assert.equal((await store.request('/products')).products[0].stock, 3);
    const dashboard = await store.request('/dashboard');
    assert.equal(dashboard.sales_today, '25.00');
    assert.equal(dashboard.transactions_today, 1);
});

test('records debt payments and restores JSON backups without replacing local accounts', async () => {
    const store = createStore();
    await createAccount(store);
    await store.request('/products', {
        method: 'POST',
        body: JSON.stringify({
            name: 'Rice',
            sku: 'RICE-01',
            category: 'Food',
            price: '100',
            stock: 4,
            threshold: 1
        })
    });
    const sale = await store.request('/transactions', {
        method: 'POST',
        body: JSON.stringify({
            items: [{ product_id: 'RICE-01', quantity: 1 }],
            payment_type: 'utang',
            payment_method: 'Cash',
            cash_received: '0',
            paid_amount: '0',
            customer_name: 'Customer One',
            customer_contact: '09111111111'
        })
    });
    const debtId = sale.transaction.debt_id;
    await store.request(`/debts/${debtId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: '25' })
    });
    assert.equal((await store.request(`/debts/${debtId}`)).debt.balance, '75.00');

    const backup = await store.request('/export');
    await store.request('/products', {
        method: 'POST',
        body: JSON.stringify({
            name: 'Tea',
            sku: 'TEA-01',
            category: 'Drinks',
            price: '5',
            stock: 2,
            threshold: 1
        })
    });
    await store.request('/import', {
        method: 'POST',
        body: JSON.stringify(backup)
    });
    assert.equal(JSON.stringify((await store.request('/products')).products.map(product => product.sku)), '["RICE-01"]');
    assert.equal((await store.request('/auth/user-ids')).user_ids[0], 'owner-1');
});
