(function() {
    'use strict';

    const DATA_KEY = 'mrb-pos-local-data-v1';
    const SESSION_KEY = 'mrb-pos-local-session-v1';
    const REMEMBERED_SESSION_KEY = 'mrb-pos-local-remembered-session-v1';
    const BACKUP_FORMAT = 'mrb-pos-browser-backup';
    const BACKUP_VERSION = 1;

    function initialState() {
        return {
            version: 1,
            users: [],
            products: [],
            transactions: [],
            debts: [],
            settings: {
                store_name: 'MRB-POS',
                currency_symbol: '₱'
            }
        };
    }

    function readState() {
        const raw = window.localStorage.getItem(DATA_KEY);
        if (raw === null) return initialState();

        let state;
        try {
            state = JSON.parse(raw);
        } catch (error) {
            throw new Error('Local POS data is unreadable. Export or restore a valid backup before continuing.');
        }
        if (!state || state.version !== 1 || !Array.isArray(state.users) ||
            !Array.isArray(state.products) || !Array.isArray(state.transactions) ||
            !Array.isArray(state.debts) || !state.settings) {
            throw new Error('Local POS data has an unsupported format. Restore a valid backup before continuing.');
        }
        return state;
    }

    function saveState(state) {
        try {
            window.localStorage.setItem(DATA_KEY, JSON.stringify(state));
        } catch (error) {
            if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                throw new Error('Browser storage is full. Export a backup and clear space before saving more data.');
            }
            throw new Error(`Could not save POS data in this browser. ${error.message || error}`);
        }
    }

    function mutateState(mutator) {
        const state = readState();
        const result = mutator(state);
        saveState(state);
        return result;
    }

    function fail(message, status) {
        const error = new Error(message);
        error.status = status;
        throw error;
    }

    function cents(value) {
        if (value == null || String(value).trim() === '') {
            fail('Enter a valid monetary amount.', 400);
        }
        const amount = Number(value);
        if (!Number.isFinite(amount)) fail('Enter a valid monetary amount.', 400);
        return Math.round((amount + Number.EPSILON) * 100);
    }

    function money(value) {
        const amount = cents(value);
        if (amount < 0) fail('Amount must be a non-negative number.', 400);
        return amount;
    }

    function amountText(value) {
        return (value / 100).toFixed(2);
    }

    function timestamp() {
        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
            + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    function localDate(value) {
        return String(value || '').slice(0, 10);
    }

    function dateKey(value) {
        const pad = number => String(number).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }

    function userSession() {
        const userId = window.sessionStorage.getItem(SESSION_KEY)
            || window.localStorage.getItem(REMEMBERED_SESSION_KEY);
        if (!userId) return null;
        return readState().users.find(user => user.user_id === userId) || null;
    }

    function setSession(userId, remember) {
        window.sessionStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(REMEMBERED_SESSION_KEY);
        if (remember) {
            window.localStorage.setItem(REMEMBERED_SESSION_KEY, userId);
        } else {
            window.sessionStorage.setItem(SESSION_KEY, userId);
        }
    }

    function accountSummary(user) {
        return {
            user_id: user.user_id,
            name: user.name,
            email: user.email
        };
    }

    async function passwordHash(password, salt) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Secure browser cryptography is unavailable. Open the site over HTTPS or localhost.');
        }
        const encoder = new TextEncoder();
        const key = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const bits = await window.crypto.subtle.deriveBits({
            name: 'PBKDF2',
            salt,
            iterations: 210000,
            hash: 'SHA-256'
        }, key, 256);
        return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function bytesToBase64(bytes) {
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return window.btoa(binary);
    }

    function base64ToBytes(value) {
        return Uint8Array.from(window.atob(value), character => character.charCodeAt(0));
    }

    async function registerAccount(data) {
        const userId = String(data.user_id || '').trim();
        const name = String(data.name || '').trim();
        const email = String(data.email || '').trim().toLowerCase();
        const contact = String(data.contact_number || '').trim();
        const password = data.password;
        if (typeof password !== 'string') fail('Enter a valid password.', 400);
        if (userId.length < 5 || userId.length > 100 || /\s/.test(userId)) {
            fail('User ID must be 5–100 characters with no spaces.', 400);
        }
        if (!name || name.length > 255 || !contact || contact.length > 100) {
            fail('Enter a name and a valid contact number.', 400);
        }
        if (!email || email.length > 255 || !email.includes('@')) {
            fail('Enter a valid email address.', 400);
        }
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) ||
            !/[#!&%_-]/.test(password)) {
            fail('Password must be at least 8 characters and include an uppercase letter, a number, and one of # ! & % _ -.', 400);
        }

        const state = readState();
        if (state.users.some(user =>
            user.user_id.toLowerCase() === userId.toLowerCase()
            || user.email.toLowerCase() === email
        )) {
            fail('That user ID or email address is already registered in this browser.', 409);
        }
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const digest = await passwordHash(password, salt);
        state.users.push({
            user_id: userId,
            name,
            email,
            contact_number: contact,
            salt: bytesToBase64(salt),
            password_hash: digest
        });
        saveState(state);
        setSession(userId, false);
        return {
            message: 'Account created and signed in on this browser.',
            user: accountSummary(state.users[state.users.length - 1])
        };
    }

    async function loginAccount(data) {
        const userId = String(data.user_id || '').trim();
        const password = data.password;
        if (!userId || typeof password !== 'string' || !password) {
            fail('Enter your user ID and password.', 400);
        }
        const user = readState().users.find(
            record => record.user_id.toLowerCase() === userId.toLowerCase()
        );
        if (!user) fail('User ID or password is incorrect.', 401);

        const digest = await passwordHash(password, base64ToBytes(user.salt));
        if (digest.length !== user.password_hash.length) fail('User ID or password is incorrect.', 401);
        let difference = 0;
        for (let index = 0; index < digest.length; index += 1) {
            difference |= digest.charCodeAt(index) ^ user.password_hash.charCodeAt(index);
        }
        if (difference !== 0) fail('User ID or password is incorrect.', 401);

        setSession(user.user_id, Boolean(data.remember));
        return { message: 'Login successful on this browser.', user: accountSummary(user) };
    }

    function productRecord(data, id) {
        const name = String(data.name || '').trim();
        const sku = String(data.sku || '').trim();
        const category = String(data.category || '').trim();
        const priceCents = money(data.price);
        const stock = Number(data.stock);
        const threshold = Number(data.threshold ?? 5);
        if (!name || !sku || !category || !Number.isInteger(stock) || stock < 0 ||
            !Number.isInteger(threshold) || threshold < 0) {
            fail('Enter valid product details.', 400);
        }
        return {
            id: id || sku,
            sku,
            name,
            category,
            price: amountText(priceCents),
            stock,
            threshold,
            active: true
        };
    }

    function transactionSummary(transaction) {
        return {
            id: transaction.id,
            receipt: transaction.receipt,
            created_at: transaction.created_at,
            total: transaction.total,
            paid: transaction.paid,
            balance: transaction.balance,
            status: transaction.status,
            payment_type: transaction.payment_type,
            payment_method: transaction.payment_method,
            customer: transaction.customer,
            type: Number(transaction.paid) < Number(transaction.total) ? 'Debt' : 'Sale'
        };
    }

    function matchesTransaction(transaction, query) {
        const search = (query.search || '').trim().toLowerCase();
        const text = [
            transaction.id,
            transaction.customer || '',
            ...transaction.items.flatMap(item => [item.name, item.sku || ''])
        ].join(' ').toLowerCase();
        if (search && !text.includes(search)) return false;
        if (query.status && transaction.status !== query.status) return false;
        if (query.date && localDate(transaction.created_at) !== query.date) return false;
        return true;
    }

    function activeDebts(state) {
        return state.debts.filter(debt => !debt.archived);
    }

    function debtStatus(debt) {
        if (Number(debt.balance) <= 0) return 'Paid';
        return Number(debt.paid) > 0 ? 'Partial' : 'Unpaid';
    }

    function debtSummary(debt) {
        return {
            id: debt.id,
            customer_id: debt.customer_id,
            name: debt.name,
            item_count: debt.item_count,
            total: debt.total,
            paid: debt.paid,
            balance: debt.balance,
            status: debtStatus(debt),
            updated_at: debt.updated_at
        };
    }

    function createTransaction(state, data) {
        if (!Array.isArray(data.items) || data.items.length === 0) {
            fail('A transaction must contain items.', 400);
        }
        const paymentType = data.payment_type;
        if (!['full', 'partial', 'utang'].includes(paymentType)) {
            fail('Select a valid payment type.', 400);
        }
        const customerName = String(data.customer_name || '').trim();
        const contact = String(data.customer_contact || '').trim();
        if (paymentType !== 'full' && !customerName) {
            fail('Customer name is required for debt or partial sales.', 400);
        }

        const requested = new Map();
        for (const item of data.items) {
            const productId = String(item.product_id || '').trim();
            const quantity = Number(item.quantity);
            if (!productId || !Number.isInteger(quantity) || quantity <= 0 ||
                requested.has(productId)) {
                fail('Transaction items are invalid or contain repeated products.', 400);
            }
            requested.set(productId, quantity);
        }

        const paymentMethod = String(data.payment_method || 'Cash').trim() || 'Cash';
        const cashReceived = money(data.cash_received ?? 0);
        const partialPaid = money(data.paid_amount ?? 0);
        const products = new Map(state.products.filter(product => product.active).map(product => [product.id, product]));
        let totalCents = 0;
        const savedItems = [];
        for (const [productId, quantity] of requested) {
            const product = products.get(productId);
            if (!product) fail('A product in this order is no longer available.', 400);
            if (product.stock < quantity) fail(`Not enough stock for ${product.name}.`, 400);
            const unitCents = money(product.price);
            totalCents += unitCents * quantity;
            savedItems.push({
                product_id: product.id,
                sku: product.sku,
                name: product.name,
                quantity,
                unit_price: amountText(unitCents),
                subtotal: amountText(unitCents * quantity)
            });
        }

        const paidCents = paymentType === 'full'
            ? totalCents
            : paymentType === 'partial' ? partialPaid : 0;
        if (paymentType === 'full' && paymentMethod.toLowerCase() === 'cash' && cashReceived < totalCents) {
            fail('Cash received must be at least the total due.', 400);
        }
        if (paymentType === 'partial' && (paidCents <= 0 || paidCents >= totalCents)) {
            fail('Partial payment must be greater than zero and less than the total.', 400);
        }

        const balanceCents = totalCents - paidCents;
        const status = balanceCents === 0 ? 'Paid' : paidCents > 0 ? 'Partial' : 'Unpaid';
        const id = Math.max(0, ...state.transactions.map(transaction => Number(transaction.id) || 0)) + 1;
        const createdAt = timestamp();
        const transaction = {
            id,
            receipt: `R-${id}`,
            created_at: createdAt,
            total: amountText(totalCents),
            paid: amountText(paidCents),
            balance: amountText(balanceCents),
            status,
            payment_type: paymentType,
            payment_method: paymentType === 'full' ? paymentMethod : '',
            customer: customerName || null,
            change: amountText(paymentType === 'full' && paymentMethod.toLowerCase() === 'cash'
                ? Math.max(cashReceived - totalCents, 0) : 0),
            items: savedItems
        };

        for (const [productId, quantity] of requested) {
            products.get(productId).stock -= quantity;
        }
        state.transactions.push(transaction);

        let debtId = null;
        if (balanceCents > 0) {
            const customerId = (contact || customerName).trim().toLocaleLowerCase().slice(0, 100);
            let debt = activeDebts(state).find(item => item.customer_id === customerId);
            if (!debt) {
                debtId = Math.max(0, ...state.debts.map(item => Number(item.id) || 0)) + 1;
                debt = {
                    id: debtId,
                    customer_id: customerId,
                    name: customerName,
                    item_count: 0,
                    total: '0.00',
                    paid: '0.00',
                    balance: '0.00',
                    updated_at: createdAt,
                    archived: false,
                    transaction_ids: [],
                    items: [],
                    payments: []
                };
                state.debts.push(debt);
            }
            debt.name = customerName;
            debt.total = amountText(money(debt.total) + totalCents);
            debt.paid = amountText(money(debt.paid) + paidCents);
            debt.balance = amountText(money(debt.balance) + balanceCents);
            debt.item_count += [...requested.values()].reduce((sum, quantity) => sum + quantity, 0);
            debt.updated_at = createdAt;
            debt.transaction_ids.push(id);
            debt.items.push(...savedItems.map(item => ({ ...item, transaction_id: id, sale_date: createdAt })));
            if (paidCents > 0) {
                debt.payments.push({
                    amount: amountText(paidCents),
                    paid_at: createdAt,
                    transaction_id: id
                });
            }
            debtId = debt.id;
        }

        return {
            transaction: {
                id,
                receipt: transaction.receipt,
                created_at: createdAt,
                total: transaction.total,
                paid: transaction.paid,
                balance: transaction.balance,
                status,
                payment_type: paymentType,
                payment_method: transaction.payment_method,
                customer: transaction.customer,
                change: transaction.change,
                debt_id: debtId,
                items: savedItems.map(item => ({
                    product_id: item.product_id,
                    name: item.name,
                    quantity: item.quantity,
                    unit_price: item.unit_price
                }))
            }
        };
    }

    function transactionDetail(transaction) {
        return {
            ...transactionSummary(transaction),
            items: transaction.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                subtotal: item.subtotal
            }))
        };
    }

    function dashboard(state) {
        const today = dateKey(new Date());
        const todaysTransactions = state.transactions.filter(item => localDate(item.created_at) === today);
        const lowStock = state.products
            .filter(product => product.active && product.stock <= product.threshold)
            .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
            .slice(0, 8)
            .map(product => ({
                id: product.id,
                name: product.name,
                stock: product.stock,
                threshold: product.threshold
            }));
        return {
            sales_today: amountText(todaysTransactions.reduce((sum, item) => sum + money(item.total), 0)),
            paid_today: amountText(todaysTransactions.reduce((sum, item) => sum + money(item.paid), 0)),
            transactions_today: todaysTransactions.length,
            outstanding_debts: amountText(activeDebts(state).reduce((sum, debt) => sum + money(debt.balance), 0)),
            low_stock_count: state.products.filter(product =>
                product.active && product.stock <= product.threshold
            ).length,
            low_stock: lowStock,
            recent_transactions: [...state.transactions]
                .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
                .slice(0, 8)
                .map(transactionSummary)
        };
    }

    function salesReport(state, query) {
        const now = new Date();
        const periods = { today: 0, '7days': 6, '30days': 29, all: null };
        if (!Object.hasOwn(periods, query.period || 'today')) fail('Invalid sales period.', 400);
        const days = periods[query.period || 'today'];
        const startDate = days === null
            ? null
            : dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
        const matches = state.transactions.filter(transaction =>
            (!startDate || localDate(transaction.created_at) >= startDate) &&
            matchesTransaction(transaction, { search: query.search || '' })
        );
        const gross = matches.reduce((sum, transaction) => sum + money(transaction.total), 0);
        const collected = matches.reduce((sum, transaction) => sum + money(transaction.paid), 0);
        const products = new Map();
        for (const transaction of matches) {
            for (const item of transaction.items) {
                const current = products.get(item.product_id) || { name: item.name, units: 0, gross: 0 };
                current.units += item.quantity;
                current.gross += money(item.subtotal);
                products.set(item.product_id, current);
            }
        }
        const bestSellers = [...products.values()]
            .sort((a, b) => b.units - a.units || b.gross - a.gross)
            .slice(0, 10)
            .map(item => ({ name: item.name, units: item.units, gross: amountText(item.gross) }));
        return {
            gross_sales: amountText(gross),
            cash_collected: amountText(collected),
            receivables: amountText(gross - collected),
            average_sale: amountText(matches.length ? Math.round(gross / matches.length) : 0),
            best_sellers: bestSellers,
            transactions: matches
                .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
                .slice(0, 1000)
                .map(transactionSummary)
        };
    }

    function backupData(state) {
        return {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            exported_at: new Date().toISOString(),
            products: state.products,
            transactions: state.transactions,
            debts: state.debts,
            settings: state.settings
        };
    }

    function validateBackup(backup) {
        if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION ||
            !Array.isArray(backup.products) || !Array.isArray(backup.transactions) ||
            !Array.isArray(backup.debts) || !backup.settings ||
            typeof backup.settings.store_name !== 'string' ||
            typeof backup.settings.currency_symbol !== 'string') {
            fail('This is not a supported MRB-POS browser backup.', 400);
        }
        for (const product of backup.products) {
            if (!product || product.id == null || typeof product.name !== 'string' ||
                typeof product.sku !== 'string' || !Number.isInteger(product.stock) ||
                !Number.isFinite(Number(product.price))) {
                fail('Backup contains an invalid product record.', 400);
            }
        }
        for (const transaction of backup.transactions) {
            if (!transaction || !Number.isInteger(transaction.id) ||
                !Array.isArray(transaction.items) || !Number.isFinite(Number(transaction.total)) ||
                !Number.isFinite(Number(transaction.paid))) {
                fail('Backup contains an invalid transaction record.', 400);
            }
        }
        for (const debt of backup.debts) {
            if (!debt || !Number.isInteger(debt.id) || !Array.isArray(debt.items) ||
                !Array.isArray(debt.payments) || !Number.isFinite(Number(debt.balance))) {
                fail('Backup contains an invalid debt record.', 400);
            }
        }
        if (!backup.settings.store_name.trim() || !backup.settings.currency_symbol.trim()) {
            fail('Backup contains invalid store settings.', 400);
        }
    }

    function restoreBackup(backup) {
        validateBackup(backup);
        const state = readState();
        state.products = backup.products;
        state.transactions = backup.transactions;
        state.debts = backup.debts;
        state.settings = backup.settings;
        saveState(state);
        return { message: 'Backup restored in this browser. Accounts and login were kept.' };
    }

    async function request(path, options) {
        const input = options || {};
        const method = String(input.method || 'GET').toUpperCase();
        const url = new URL(path, window.location.origin);
        const route = url.pathname.replace(/^\/api/, '');
        let data = {};
        if (input.body) {
            try {
                data = JSON.parse(input.body);
            } catch (error) {
                fail('Request data is invalid.', 400);
            }
        }

        if (route === '/auth/account-exists' && method === 'GET') {
            return { exists: readState().users.length > 0 };
        }
        if (route === '/auth/user-ids' && method === 'GET') {
            return { user_ids: readState().users.map(user => user.user_id).sort((a, b) => a.localeCompare(b)) };
        }
        if (route === '/auth/register' && method === 'POST') return registerAccount(data);
        if (route === '/auth/login' && method === 'POST') return loginAccount(data);
        if (route === '/auth/logout' && method === 'POST') {
            window.sessionStorage.removeItem(SESSION_KEY);
            window.localStorage.removeItem(REMEMBERED_SESSION_KEY);
            return { message: 'Logged out.' };
        }
        if (route === '/auth/me' && method === 'GET') {
            const user = userSession();
            return { user: user ? { user_id: user.user_id, name: user.name } : null };
        }

        if (!userSession()) fail('Please log in to continue.', 401);

        if (route === '/products' && method === 'GET') {
            return {
                products: readState().products.filter(product => product.active)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(({ id, sku, name, category, price, stock, threshold }) =>
                        ({ id, sku, name, category, price, stock, threshold }))
            };
        }
        if (route === '/products' && method === 'POST') {
            return mutateState(state => {
                const product = productRecord(data);
                if (state.products.some(item => item.sku.toLowerCase() === product.sku.toLowerCase())) {
                    fail('A product with this SKU already exists.', 409);
                }
                state.products.push(product);
                return { message: 'Product created.', id: product.id };
            });
        }
        const productMatch = route.match(/^\/products\/(.+)$/);
        if (productMatch && method === 'PUT') {
            const id = decodeURIComponent(productMatch[1]);
            return mutateState(state => {
                const index = state.products.findIndex(item => String(item.id) === id && item.active);
                if (index < 0) fail('Product not found.', 404);
                const product = productRecord(data, state.products[index].id);
                if (state.products.some(item => item.id !== product.id &&
                    item.sku.toLowerCase() === product.sku.toLowerCase())) {
                    fail('That SKU is already in use.', 409);
                }
                state.products[index] = product;
                return { message: 'Product updated.' };
            });
        }
        if (productMatch && method === 'DELETE') {
            const id = decodeURIComponent(productMatch[1]);
            return mutateState(state => {
                const product = state.products.find(item => String(item.id) === id && item.active);
                if (!product) fail('Product not found.', 404);
                product.active = false;
                return { message: 'Product archived.' };
            });
        }

        if (route === '/transactions' && method === 'POST') {
            return mutateState(state => createTransaction(state, data));
        }
        if (route === '/transactions' && method === 'GET') {
            const query = Object.fromEntries(url.searchParams.entries());
            return {
                transactions: readState().transactions
                    .filter(transaction => matchesTransaction(transaction, query))
                    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
                    .slice(0, 1000)
                    .map(transactionSummary)
            };
        }
        const transactionMatch = route.match(/^\/transactions\/(\d+)$/);
        if (transactionMatch && method === 'GET') {
            const transaction = readState().transactions.find(item => item.id === Number(transactionMatch[1]));
            if (!transaction) fail('Transaction not found.', 404);
            return { transaction: transactionDetail(transaction) };
        }

        if (route === '/debts' && method === 'GET') {
            return {
                debts: activeDebts(readState())
                    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
                    .map(debtSummary)
            };
        }
        const debtMatch = route.match(/^\/debts\/(\d+)(?:\/(payments))?$/);
        if (debtMatch && method === 'GET' && !debtMatch[2]) {
            const debt = readState().debts.find(item => item.id === Number(debtMatch[1]));
            if (!debt || debt.archived) fail('Debt record not found.', 404);
            return {
                debt: {
                    ...debtSummary(debt),
                    items: debt.items.map(item => ({
                        transaction_id: item.transaction_id,
                        receipt: `R-${item.transaction_id}`,
                        sale_date: item.sale_date,
                        name: item.name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        subtotal: item.subtotal
                    })),
                    payments: debt.payments
                }
            };
        }
        if (debtMatch && method === 'POST' && debtMatch[2]) {
            const debtId = Number(debtMatch[1]);
            const paymentCents = money(data.amount);
            if (paymentCents <= 0) fail('Payment must be greater than zero.', 400);
            return mutateState(state => {
                const debt = state.debts.find(item => item.id === debtId && !item.archived);
                if (!debt) fail('Debt record not found.', 404);
                const balance = money(debt.balance);
                if (paymentCents > balance) fail('Payment cannot exceed the outstanding balance.', 400);
                const paidAt = timestamp();
                debt.payments.push({
                    amount: amountText(paymentCents),
                    paid_at: paidAt,
                    transaction_id: null
                });
                debt.paid = amountText(money(debt.paid) + paymentCents);
                debt.balance = amountText(balance - paymentCents);
                debt.updated_at = paidAt;
                let remaining = paymentCents;
                for (const transactionId of debt.transaction_ids) {
                    const transaction = state.transactions.find(item => item.id === transactionId);
                    if (!transaction) continue;
                    const due = money(transaction.total) - money(transaction.paid);
                    const applied = Math.min(remaining, due);
                    if (applied > 0) {
                        transaction.paid = amountText(money(transaction.paid) + applied);
                        transaction.balance = amountText(money(transaction.total) - money(transaction.paid));
                        transaction.status = Number(transaction.balance) === 0 ? 'Paid' : 'Partial';
                        remaining -= applied;
                    }
                    if (remaining <= 0) break;
                }
                return { message: 'Payment recorded.', balance: debt.balance };
            });
        }
        if (debtMatch && method === 'DELETE' && !debtMatch[2]) {
            const debtId = Number(debtMatch[1]);
            return mutateState(state => {
                const debt = state.debts.find(item => item.id === debtId && !item.archived);
                if (!debt) fail('Debt record not found.', 404);
                debt.archived = true;
                return { message: 'Debt record archived. Sales and payment history were retained.' };
            });
        }

        if (route === '/dashboard' && method === 'GET') return dashboard(readState());
        if (route === '/reports/sales' && method === 'GET') {
            return salesReport(readState(), Object.fromEntries(url.searchParams.entries()));
        }
        if (route === '/settings' && method === 'GET') return readState().settings;
        if (route === '/settings' && method === 'PUT') {
            const storeName = String(data.store_name || '').trim();
            const currencySymbol = String(data.currency_symbol || '').trim();
            if (!storeName || storeName.length > 100 || !currencySymbol || currencySymbol.length > 5) {
                fail('Enter a store name and currency symbol.', 400);
            }
            return mutateState(state => {
                state.settings = { store_name: storeName, currency_symbol: currencySymbol };
                return { message: 'Settings saved.' };
            });
        }
        if (route === '/export' && method === 'GET') return backupData(readState());
        if (route === '/import' && method === 'POST') return restoreBackup(data);
        fail(`Local POS does not support ${method} ${route}.`, 404);
    }

    window.MRBLocalStore = { request };
})();
