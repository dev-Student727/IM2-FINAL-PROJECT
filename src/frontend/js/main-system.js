const FRONTEND_ENTRY_URL = new URL('../index.html', document.currentScript.src);
const LOGIN_PAGE_URL = new URL('../pages/login.html', document.currentScript.src);
let currencySymbol = '₱';
let storeName = 'MRB-POS';
const PAGE_TITLE = document.title.split('|').pop().trim();

function applyStoreName(value) {
    const name = String(value || '').trim();
    if (!name) return;

    storeName = name;
    document.querySelectorAll('.brand-copy strong').forEach(brandName => {
        brandName.textContent = name;
    });
    document.title = `${name} | ${PAGE_TITLE}`;
}

function makeExportFileName(kind, extension) {
    const safeStoreName = storeName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[.-]+|[. -]+$/g, '') || 'store';
    const date = new Date().toISOString().slice(0, 10);
    return `${safeStoreName}-${kind}-${date}.${extension}`;
}

async function apiRequest(path, options = {}) {
    return window.MRBLocalStore.request(path, options);
}

window.MRBApi = { request: apiRequest };

let authenticatedSessionPromise;

function requireAuthenticatedSession() {
    if (!authenticatedSessionPromise) {
        authenticatedSessionPromise = apiRequest('/auth/me')
            .then(({ user }) => {
                if (user) return true;
                window.location.replace(LOGIN_PAGE_URL.href);
                return false;
            })
            .catch(error => {
                console.error('Could not verify the current login session:', error);
                window.alert(`Could not verify your login session. ${error.message}`);
                return false;
            });
    }
    return authenticatedSessionPromise;
}

function addLogoutButton() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.querySelector('.logout-btn')) return;

    sidebar.querySelectorAll('.nav-item').forEach(item => {
        const label = item.querySelector('span')?.textContent.trim();
        if (label) {
            item.setAttribute('aria-label', label);
            item.title = label;
        }
    });

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'logout-btn';
    button.setAttribute('aria-label', 'Log out');
    button.title = 'Log out';

    const icon = document.createElement('i');
    icon.className = 'bx bx-log-out';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'Log out';
    button.append(icon, label);

    button.addEventListener('click', async () => {
        if (!window.confirm('Are you sure you want to log out?')) return;

        button.disabled = true;
        try {
            await apiRequest('/auth/logout', { method: 'POST' });
            window.location.href = FRONTEND_ENTRY_URL.href;
        } catch (error) {
            button.disabled = false;
            if (error.status === 401) {
                window.location.href = FRONTEND_ENTRY_URL.href;
                return;
            }
            console.error('Could not log out:', error);
            window.alert(`Could not log out. ${error.message}`);
        }
    });

    sidebar.appendChild(button);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!await requireAuthenticatedSession()) return;

    addLogoutButton();

    const productGrid = document.getElementById('product-grid');
    try {
        const settings = await apiRequest('/settings');
        currencySymbol = settings.currency_symbol || currencySymbol;
        applyStoreName(settings.store_name);
    } catch (error) {
        console.error('Could not load store preferences:', error);
    }
    if (productGrid) {
        try {
            const { products: savedProducts } = await apiRequest('/products');
            productGrid.replaceChildren();

            if (savedProducts.length === 0) {
                const message = document.createElement('p');
                message.className = 'product-loading';
                message.setAttribute('role', 'status');
                message.textContent = 'No products yet. Add them from the Product menu.';
                productGrid.appendChild(message);
            } else {
                savedProducts.forEach(product => {
                    const card = document.createElement('button');
                    card.type = 'button';
                    card.className = 'product-card';
                    card.id = `product-${product.id}`;
                    card.dataset.productId = product.id;
                    card.dataset.productSku = product.sku;
                    card.dataset.productCategory = product.category.toLowerCase();

                    const category = document.createElement('span');
                    category.className = 'product-category';
                    category.textContent = product.category;

                    const name = document.createElement('strong');
                    name.className = 'product-name';
                    name.textContent = product.name;

                    const details = document.createElement('span');
                    details.className = 'product-details';

                    const price = document.createElement('span');
                    price.className = 'product-price';
                    price.textContent = `${currencySymbol}${Number(product.price).toFixed(2)}`;

                    const stock = document.createElement('span');
                    stock.className = 'stock-badge';
                    stock.textContent = `${product.stock} left`;

                    details.append(price, stock);
                    card.append(category, name, details);
                    productGrid.appendChild(card);
                });
            }
        } catch (error) {
            console.error('Unable to load saved POS products:', error);
            productGrid.replaceChildren();
            const message = document.createElement('p');
            message.className = 'product-loading';
            message.setAttribute('role', 'alert');
            message.textContent = `Could not load products. ${error.message}`;
            productGrid.appendChild(message);
        }
    }

    const productCards = document.querySelectorAll('.product-card');
    const orderPanel = document.querySelector('.order-panel');
    const orderEmpty = document.getElementById('order-empty');
    const orderCount = document.getElementById('order-count');
    const checkoutButton = document.querySelector('.checkout-button');
    const checkoutDialog = document.getElementById('checkout-dialog');
    const checkoutForm = document.getElementById('checkout-form');
    const checkoutTotal = document.getElementById('checkout-total');
    const checkoutError = document.getElementById('checkout-error');
    const receiptDialog = document.getElementById('receipt-dialog');
    const orderStatus = document.getElementById('order-status');
    const storeName = document.querySelector('.brand-copy strong')?.textContent.trim() || 'MRB-POS';
    let subtotalDisplay = document.getElementById('order-subtotal');
    const totalDisplay = document.getElementById('order-total');

    if (subtotalDisplay?.textContent.trim().toLowerCase() === 'subtotal') {
        const subtotalAmount = subtotalDisplay
            .closest('.total-row')
            ?.querySelector('span:last-child');

        if (subtotalAmount) {
            subtotalDisplay.removeAttribute('id');
            subtotalAmount.id = 'order-subtotal';
            subtotalDisplay = subtotalAmount;
        }
    }

    if (
        !orderPanel ||
        !orderEmpty ||
        !orderCount ||
        !checkoutButton ||
        !(checkoutDialog instanceof HTMLDialogElement) ||
        !checkoutForm ||
        !checkoutTotal ||
        !checkoutError ||
        !(receiptDialog instanceof HTMLDialogElement) ||
        !subtotalDisplay ||
        !totalDisplay
    ) {
        return;
    }

    document.title = `${storeName} | Point of Sales`;

    const orderItems = document.createElement('div');
    orderItems.className = 'order-items';
    orderItems.id = 'order-items';
    orderPanel.insertBefore(orderItems, orderEmpty);

    const products = new Map();
    const cart = new Map();
    let paymentType = 'full';
    let latestReceipt = null;

    // Keep checkout fields and live payment calculations in sync with the selected type.
    function updateCheckoutFields() {
        const totalCents = getCartTotalCents();
        const paymentMethod = document.getElementById('checkout-payment-method').value;
        const showCash = paymentType === 'full' && paymentMethod === 'cash';
        const downPaymentCents = Math.round(
            Number(document.getElementById('checkout-down-payment').value || 0) * 100
        );
        const cashReceivedCents = Math.round(
            Number(document.getElementById('checkout-cash-received').value || 0) * 100
        );

        checkoutDialog.querySelector('[data-checkout-section="customer"]').hidden = paymentType === 'full';
        checkoutDialog.querySelector('[data-checkout-section="method"]').hidden = paymentType !== 'full';
        checkoutDialog.querySelector('[data-checkout-section="cash"]').hidden = !showCash;
        checkoutDialog.querySelector('[data-checkout-section="change"]').hidden = !showCash;
        checkoutDialog.querySelector('[data-checkout-section="utang"]').hidden = paymentType !== 'utang';
        checkoutDialog.querySelector('[data-checkout-section="partial"]').hidden = paymentType !== 'partial';
        checkoutDialog.querySelector('[data-checkout-section="balance"]').hidden = paymentType !== 'partial';

        document.getElementById('checkout-customer-name').required = paymentType !== 'full';
        document.getElementById('checkout-cash-received').required = showCash;
        document.getElementById('checkout-down-payment').required = paymentType === 'partial';

        checkoutTotal.textContent = formatMoney(totalCents);
        document.getElementById('checkout-debt-amount').textContent = formatMoney(totalCents);
        document.getElementById('checkout-change').textContent =
            formatMoney(Math.max(0, cashReceivedCents - totalCents));
        document.getElementById('checkout-balance').textContent =
            formatMoney(Math.max(0, totalCents - downPaymentCents));
    }

    function getCartTotalCents() {
        let totalCents = 0;
        cart.forEach(item => {
            totalCents += Math.round(item.price * 100) * item.quantity;
        });
        return totalCents;
    }

    function formatMoney(amountInCents) {
        return `${currencySymbol}${(amountInCents / 100).toFixed(2)}`;
    }

    // Build the receipt from a completed-sale snapshot so cart clearing cannot affect it.
    function renderReceipt(receipt) {
        document.getElementById('receipt-store-title').textContent = receipt.storeName;
        document.getElementById('receipt-store-name').textContent = receipt.storeName;
        document.getElementById('receipt-number').textContent = receipt.number;
        document.getElementById('receipt-date').textContent = receipt.date;
        document.getElementById('receipt-reference').textContent = `Receipt ${receipt.number}`;
        document.getElementById('receipt-total').textContent = formatMoney(receipt.totalCents);
        document.getElementById('receipt-paid-label').textContent =
            `Paid (${receipt.paymentType})`;
        document.getElementById('receipt-paid').textContent = formatMoney(receipt.paidCents);
        document.getElementById('receipt-balance').textContent = formatMoney(receipt.balanceCents);
        document.getElementById('receipt-change-row').hidden = receipt.changeCents <= 0;
        document.getElementById('receipt-change').textContent = formatMoney(receipt.changeCents);

        const receiptLines = document.getElementById('receipt-lines');
        receiptLines.replaceChildren();

        receipt.items.forEach(item => {
            const line = document.createElement('div');
            line.className = 'receipt-line';

            const heading = document.createElement('div');
            heading.className = 'receipt-line-heading';

            const name = document.createElement('span');
            name.textContent = item.name;

            const amount = document.createElement('strong');
            amount.textContent = formatMoney(item.unitPriceCents * item.quantity);
            heading.append(name, amount);

            const details = document.createElement('small');
            details.textContent =
                `${item.quantity} × ${formatMoney(item.unitPriceCents)}`;
            line.append(heading, details);
            receiptLines.appendChild(line);
        });
    }

    // Generate a printable vector PDF with an ASCII-safe built-in font.
    function downloadReceipt(receipt) {
        const pageWidth = 420;
        const padding = 28;
        const contentWidth = pageWidth - padding * 2;
        const itemRows = receipt.items.map(item => ({
            ...item,
            nameLines: wrapPdfText(item.name, 35)
        }));
        const itemRowsHeight = itemRows.reduce(
            (height, item) => height + 43 + (item.nameLines.length - 1) * 13,
            0
        );
        const customerHeight = receipt.customerName ? 25 : 0;
        const pageHeight = 390 + itemRowsHeight + customerHeight;
        const commands = [];
        let cursor = 0;

        function pdfText(value, x, top, size, color, bold = false) {
            const safeValue = toPdfText(value)
                .replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)');
            const y = pageHeight - top - size;
            commands.push(
                `${color[0]} ${color[1]} ${color[2]} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${safeValue}) Tj ET`
            );
        }

        function pdfRect(x, top, width, height, color) {
            const y = pageHeight - top - height;
            commands.push(
                `${color[0]} ${color[1]} ${color[2]} rg ${x} ${y} ${width} ${height} re f`
            );
        }

        function pdfRule(top) {
            const y = pageHeight - top;
            commands.push(`0.72 0.72 1 RG 0.7 w ${padding} ${y} m ${pageWidth - padding} ${y} l S`);
        }

        function wrapPdfText(value, maxLength) {
            const words = toPdfText(value).split(/\s+/);
            const lines = [];
            let currentLine = '';

            words.forEach(word => {
                if (word.length > maxLength) {
                    if (currentLine) {
                        lines.push(currentLine);
                        currentLine = '';
                    }
                    for (let index = 0; index < word.length; index += maxLength) {
                        lines.push(word.slice(index, index + maxLength));
                    }
                    return;
                }

                const candidate = currentLine ? `${currentLine} ${word}` : word;
                if (candidate.length > maxLength) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = candidate;
                }
            });


            if (currentLine) {
                lines.push(currentLine);
            }
            return lines.length ? lines : [''];
        }

        function toPdfText(value) {
            return String(value)
                .replace(/₱/g, 'PHP ')
                .replace(/[×]/g, 'x')
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\x20-\x7E]/g, '?');
        }

        pdfRect(0, 0, pageWidth, pageHeight, [0.97, 0.97, 1]);
        pdfRect(0, 0, pageWidth, 105, [0, 0, 0.459]);
        pdfRect(padding, 121, contentWidth, pageHeight - 145, [1, 1, 1]);
        pdfText(receipt.storeName, padding + 2, 28, 21, [1, 1, 1], true);
        pdfText('SALES RECEIPT', padding + 2, 58, 10, [0.55, 0.55, 1], true);
        pdfText(receipt.number, pageWidth - padding - 92, 31, 12, [1, 1, 1], true);
        pdfText(receipt.date, padding + 2, 78, 9, [0.88, 0.88, 1]);

        cursor = 145;
        pdfText(`Receipt ${receipt.number}`, padding + 2, cursor, 10, [0, 0, 0.459], true);
        pdfText(receipt.date, padding + 2, cursor + 17, 9, [0, 0, 0.459]);
        cursor += 39;
        if (receipt.customerName) {
            pdfText(`Customer: ${receipt.customerName}`, padding + 2, cursor, 10, [0, 0, 0.459]);
            cursor += 22;
        }

        pdfRule(cursor);
        cursor += 18;
        pdfText('ITEM', padding + 2, cursor, 9, [0, 0, 0.459], true);
        pdfText('AMOUNT', pageWidth - padding - 58, cursor, 9, [0, 0, 0.459], true);
        cursor += 18;

        itemRows.forEach(item => {
            item.nameLines.forEach((line, index) => {
                pdfText(line, padding + 2, cursor + index * 12, 10, [0, 0, 0.459]);
            });
            const amount = formatMoney(item.unitPriceCents * item.quantity);
            pdfText(amount, pageWidth - padding - 70, cursor, 10, [0, 0, 0.459], true);
            cursor += 16 + (item.nameLines.length - 1) * 12;
            pdfText(`${item.quantity} x ${formatMoney(item.unitPriceCents)}`, padding + 2, cursor, 8, [0, 0, 0.459]);
            cursor += 17;
            pdfRule(cursor);
            cursor += 10;
        });

        const totalRows = [
            ['Total', formatMoney(receipt.totalCents), true],
            [`Paid (${receipt.paymentType})`, formatMoney(receipt.paidCents), false],
            ['Balance', formatMoney(receipt.balanceCents), false]
        ];
        if (receipt.changeCents > 0) {
            totalRows.push(['Change', formatMoney(receipt.changeCents), false]);
        }
        if (receipt.paymentMethod) {
            totalRows.push(['Method', receipt.paymentMethod, false]);
        }

        totalRows.forEach(([label, amount, emphasize]) => {
            pdfText(label, padding + 2, cursor, emphasize ? 11 : 10, [0, 0, 0.459], emphasize);
            pdfText(amount, pageWidth - padding - 70, cursor, emphasize ? 11 : 10, [0, 0, 0.459], emphasize);
            cursor += 19;
        });

        cursor += 5;
        pdfRule(cursor);
        pdfText('Thank you for your purchase!', padding + 2, cursor + 15, 10, [0, 0, 0.459], true);

        const stream = commands.join('\n');
        const objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
            `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
        ];
        let pdf = '%PDF-1.4\n';
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets.push(pdf.length);
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });

        const xrefOffset = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        offsets.slice(1).forEach(offset => {
            pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
        });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

        const file = new Blob([pdf], { type: 'application/pdf' });
        const downloadUrl = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `MRB-${receipt.number}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    }

    document.getElementById('receipt-close').addEventListener('click', () => {
        receiptDialog.close();
    });
    document.getElementById('receipt-close-icon').addEventListener('click', () => {
        receiptDialog.close();
    });
    document.getElementById('receipt-print').addEventListener('click', () => {
        window.print();
    });
    document.getElementById('receipt-download').addEventListener('click', () => {
        if (latestReceipt) {
            downloadReceipt(latestReceipt);
        }
    });

    // Open checkout only when there are items and start with a clean full-payment form.
    checkoutButton.addEventListener('click', () => {
        if (cart.size === 0) {
            return;
        }

        checkoutForm.reset();
        paymentType = 'full';
        checkoutError.hidden = true;
        checkoutError.textContent = '';
        orderStatus.hidden = true;
        checkoutDialog.querySelectorAll('[data-payment-type]').forEach(button => {
            const isActive = button.dataset.paymentType === paymentType;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        updateCheckoutFields();
        checkoutDialog.showModal();
    });

    checkoutDialog.querySelector('#checkout-close').addEventListener('click', () => {
        checkoutDialog.close();
    });
    checkoutDialog.querySelector('#checkout-cancel').addEventListener('click', () => {
        checkoutDialog.close();
    });
    checkoutDialog.addEventListener('click', event => {
        if (event.target === checkoutDialog) {
            checkoutDialog.close();
        }
    });

    checkoutDialog.querySelectorAll('[data-payment-type]').forEach(button => {
        button.addEventListener('click', () => {
            paymentType = button.dataset.paymentType;
            checkoutDialog.querySelectorAll('[data-payment-type]').forEach(option => {
                const isActive = option === button;
                option.classList.toggle('is-active', isActive);
                option.setAttribute('aria-pressed', String(isActive));
            });
            checkoutError.hidden = true;
            updateCheckoutFields();
        });
    });

    function handleCheckoutFieldsChanged() {
        checkoutError.hidden = true;
        checkoutError.textContent = '';
        updateCheckoutFields();
    }

    checkoutForm.addEventListener('input', handleCheckoutFieldsChanged);
    checkoutForm.addEventListener('change', handleCheckoutFieldsChanged);
    checkoutForm.addEventListener('submit', async event => {
        event.preventDefault();

        const totalCents = getCartTotalCents();
        const customerName = document.getElementById('checkout-customer-name').value.trim();
        const cashReceivedCents = Math.round(
            Number(document.getElementById('checkout-cash-received').value || 0) * 100
        );
        const downPaymentCents = Math.round(
            Number(document.getElementById('checkout-down-payment').value || 0) * 100
        );
        const paymentMethodSelect = document.getElementById('checkout-payment-method');
        const paymentMethod = paymentMethodSelect.value;
        const paymentMethodLabel = paymentMethodSelect.selectedOptions[0].textContent;
        let errorMessage = '';

        if (cart.size === 0) {
            errorMessage = 'Add at least one product before completing checkout.';
        } else if (paymentType !== 'full' && !customerName) {
            errorMessage = 'Enter the customer name to record a debt or partial payment.';
        } else if (paymentType === 'full' && paymentMethod === 'cash' && cashReceivedCents < totalCents) {
            errorMessage = 'Cash received must be at least the total due.';
        } else if (paymentType === 'partial' &&
            (downPaymentCents <= 0 || downPaymentCents >= totalCents)) {
            errorMessage = 'Down payment must be greater than ₱0.00 and less than the total due.';
        }

        if (errorMessage) {
            checkoutError.textContent = errorMessage;
            checkoutError.hidden = false;
            return;
        }

        const paidCents = paymentType === 'full'
            ? totalCents
            : paymentType === 'partial' ? downPaymentCents : 0;
        const balanceCents = totalCents - paidCents;
        const changeCents = paymentType === 'full' && paymentMethod === 'cash'
            ? cashReceivedCents - totalCents
            : 0;
        const completedItems = [...cart.values()];
        let savedTransaction;
        try {
            const result = await apiRequest('/transactions', {
                method: 'POST',
                body: JSON.stringify({
                    items: completedItems.map(item => ({
                        product_id: item.id,
                        quantity: item.quantity
                    })),
                    payment_type: paymentType,
                    payment_method: paymentMethod,
                    cash_received: (cashReceivedCents / 100).toFixed(2),
                    paid_amount: (downPaymentCents / 100).toFixed(2),
                    customer_name: customerName,
                    customer_contact: document.getElementById('checkout-customer-contact').value.trim()
                })
            });
            savedTransaction = result.transaction;
        } catch (error) {
            console.error('Unable to complete database transaction:', error);
            checkoutError.textContent = error.message || 'Could not complete the sale.';
            checkoutError.hidden = false;
            return;
        }

        const savedItemsById = new Map(savedTransaction.items.map(item => [item.product_id, item]));
        completedItems.forEach(item => {
            const soldItem = savedItemsById.get(item.id);
            if (soldItem) {
                item.name = soldItem.name;
                const catalogProduct = products.get(item.id);
                if (catalogProduct) catalogProduct.stock -= item.quantity;
            }
        });

        latestReceipt = {
            number: savedTransaction.receipt,
            date: new Date(savedTransaction.created_at.replace(' ', 'T')).toLocaleString(),
            storeName,
            paymentType,
            paymentMethod: paymentType === 'full' ? paymentMethodLabel : '',
            customerName: paymentType === 'full' ? '' : customerName,
            totalCents: Math.round(Number(savedTransaction.total) * 100),
            paidCents: Math.round(Number(savedTransaction.paid) * 100),
            balanceCents: Math.round(Number(savedTransaction.balance) * 100),
            changeCents: Math.round(Number(savedTransaction.change) * 100),
            items: savedTransaction.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unitPriceCents: Math.round(Number(item.unit_price) * 100)
            }))
        };

        cart.clear();
        renderOrder();
        try {
            const { products: refreshedProducts } = await apiRequest('/products');
            refreshedProducts.forEach(record => {
                const product = [...products.values()].find(item => item.id === record.id);
                if (product) {
                    product.stock = Number(record.stock);
                }
            });
        } catch (error) {
            console.error('Sale saved, but the refreshed product list could not be loaded:', error);
        }
        renderOrder();

        if (orderStatus) {
            if (paymentType === 'utang') {
                orderStatus.textContent =
                    `Sale completed. ${formatMoney(balanceCents)} is due from ${customerName}.`;
            } else if (paymentType === 'partial') {
                orderStatus.textContent =
                    `Sale completed. ${formatMoney(paidCents)} paid; ${formatMoney(balanceCents)} is due from ${customerName}.`;
            } else {
                orderStatus.textContent =
                    `Sale completed. ${formatMoney(totalCents)} paid by ${paymentMethodLabel}.`;
            }
            orderStatus.hidden = false;
        }

        checkoutDialog.close();
        renderReceipt(latestReceipt);
        receiptDialog.showModal();
    });

    productCards.forEach(card => {
        const name = card.querySelector('.product-name')?.textContent.trim();
        const priceText = card.querySelector('.product-price')?.textContent ?? '';
        const stockText = card.querySelector('.stock-badge')?.textContent ?? '';
        const price = Number(priceText.replace(/[^\d.]/g, ''));
        const stock = Number.parseInt(stockText, 10);
        const productId = card.dataset.productId || '';

        if (!productId || !name || !Number.isFinite(price) ||
            !Number.isInteger(stock) || stock < 0) {
            console.error('Product card needs a unique id, name, valid price, and stock:', card);
            return;
        }

        if (products.has(productId)) {
            console.error(`Duplicate product card id: ${productId}`);
            return;
        }

        products.set(productId, {
            id: productId,
            sku: card.dataset.productSku || '',
            name,
            price,
            stock,
            card
        });

        card.addEventListener('click', () => {
            const product = products.get(productId);
            const item = cart.get(product.id);
            const quantityInCart = item ? item.quantity : 0;

            if (quantityInCart >= product.stock) {
                return;
            }

            if (item) {
                item.quantity += 1;
            } else {
                cart.set(product.id, { ...product, quantity: 1 });
            }

            renderOrder();
        });
    });

    const posSearch = document.getElementById('product-search');
    const posCategory = document.getElementById('category-filter');
    function filterPOSCatalog() {
        const searchTerm = posSearch?.value.trim().toLowerCase() || '';
        const category = posCategory?.value.toLowerCase() || 'all';
        productCards.forEach(card => {
            const name = card.querySelector('.product-name')?.textContent.toLowerCase() || '';
            const sku = card.dataset.productSku.toLowerCase();
            const matchesSearch = name.includes(searchTerm) || sku.includes(searchTerm);
            const matchesCategory = category === 'all' ||
                card.dataset.productCategory === category;
            card.hidden = !matchesSearch || !matchesCategory;
        });
    }
    posSearch?.addEventListener('input', filterPOSCatalog);
    posCategory?.addEventListener('change', filterPOSCatalog);

    orderItems.addEventListener('click', event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest('button[data-action]');
        if (!button) {
            return;
        }

        const item = cart.get(button.dataset.productId);
        if (!item) {
            return;
        }

        if (button.dataset.action === 'increase' && item.quantity < item.stock) {
            item.quantity += 1;
        } else if (button.dataset.action === 'decrease') {
            if (item.quantity <= 1) {
                cart.delete(item.id);
            } else {
                item.quantity -= 1;
            }
        } else if (button.dataset.action === 'remove') {
            cart.delete(item.id);
        }

        renderOrder();
    });

    function createControl(action, item, label, symbol = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = action === 'remove'
            ? 'remove-item-button'
            : 'quantity-button';
        button.dataset.action = action;
        button.dataset.productId = item.id;
        button.setAttribute('aria-label', label);

        if (action === 'remove') {
            const icon = document.createElement('i');
            icon.className = 'bx bx-trash';
            icon.setAttribute('aria-hidden', 'true');
            button.appendChild(icon);
        } else {
            button.textContent = symbol;
        }

        if (action === 'increase') {
            button.disabled = item.quantity >= item.stock;
        }

        return button;
    }

    function renderOrder() {
        orderItems.replaceChildren();

        if (cart.size > 0 && orderStatus) {
            orderStatus.hidden = true;
        }

        let subtotal = 0;

        cart.forEach(item => {
            subtotal += item.price * item.quantity;

            const row = document.createElement('div');
            row.className = 'order-item';

            const info = document.createElement('div');
            info.className = 'order-item-info';

            const name = document.createElement('span');
            name.className = 'order-item-name';
            name.textContent = item.name;

            const price = document.createElement('span');
            price.className = 'order-item-price';
            price.textContent = `₱${item.price.toFixed(2)} × ${item.quantity}`;
            info.append(name, price);

            const controls = document.createElement('div');
            controls.className = 'order-item-controls';
            controls.append(
                createControl('decrease', item, `Decrease ${item.name} quantity`, '−')
            );

            const quantity = document.createElement('span');
            quantity.className = 'order-item-quantity';
            quantity.textContent = String(item.quantity);
            controls.append(quantity);

            controls.append(
                createControl('increase', item, `Increase ${item.name} quantity`, '+'),
                createControl('remove', item, `Remove ${item.name}`)
            );

            row.append(info, controls);
            orderItems.appendChild(row);
        });

        const formattedSubtotal = `₱${subtotal.toFixed(2)}`;
        orderCount.textContent = String(cart.size);
        subtotalDisplay.textContent = formattedSubtotal;
        totalDisplay.textContent = formattedSubtotal;
        orderEmpty.hidden = cart.size > 0;

        products.forEach(product => {
            const item = cart.get(product.id);
            const quantityInCart = item ? item.quantity : 0;
            const remainingStock = product.stock - quantityInCart;
            const stockBadge = product.card.querySelector('.stock-badge');

            if (stockBadge) {
                stockBadge.textContent = `${remainingStock} left`;
            }

            product.card.disabled = remainingStock <= 0;
        });
    }

    renderOrder();
});

// Javascript Function for Adding Product state
// Product page: open the Add Product dialog and manage inventory table rows.
document.addEventListener('DOMContentLoaded', async () => {
    if (!await requireAuthenticatedSession()) return;

    const addProductButton = document.getElementById('open-add-product');
    const addProductDialog = document.getElementById('add-product-dialog');
    const addProductForm = document.getElementById('add-product-form');
    const productTableBody = document.getElementById('product-table-body');
    const productSearch = document.getElementById('product-search');
    const categoryFilter = document.getElementById('category-filter');
    const productError = document.getElementById('add-product-error');

    if (
        !addProductButton ||
        !(addProductDialog instanceof HTMLDialogElement) ||
        !addProductForm ||
        !productTableBody ||
        !productSearch ||
        !categoryFilter ||
        !productError
    ) {
        return;
    }

    try {
        const settings = await apiRequest('/settings');
        currencySymbol = settings.currency_symbol || currencySymbol;
        applyStoreName(settings.store_name);
    } catch (error) {
        console.error('Could not load store preferences:', error);
    }

    const nameInput = document.getElementById('new-product-name');
    const categoryInput = document.getElementById('new-product-category');
    const skuInput = document.getElementById('new-product-sku');
    const priceInput = document.getElementById('new-product-price');
    const stockInput = document.getElementById('new-product-stock');
    const thresholdInput = document.getElementById('new-product-threshold');
    const formTitle = document.getElementById('add-product-title');
    const saveButton = addProductForm.querySelector('button[type="submit"]');
    let editingRow = null;

    if (
        !(nameInput instanceof HTMLInputElement) ||
        !(categoryInput instanceof HTMLSelectElement) ||
        !(skuInput instanceof HTMLInputElement) ||
        !(priceInput instanceof HTMLInputElement) ||
        !(stockInput instanceof HTMLInputElement) ||
        !(thresholdInput instanceof HTMLInputElement)
    ) {
        console.error('Add Product form is missing a required input.');
        return;
    }

    function updateProductTable() {
        const searchTerm = productSearch.value.trim().toLowerCase();
        const selectedCategory = categoryFilter.value.toLowerCase();
        const productRows = productTableBody.querySelectorAll('tr[data-product-sku]');

        productRows.forEach(row => {
            const matchesSearch =
                row.dataset.productName.includes(searchTerm) ||
                row.dataset.productSku.toLowerCase().includes(searchTerm);
            const matchesCategory =
                selectedCategory === 'all' ||
                row.dataset.productCategory === selectedCategory;
            row.hidden = !matchesSearch || !matchesCategory;
        });
    }

    function showEmptyTableRow() {
        if (productTableBody.querySelector('tr[data-product-sku]')) {
            return;
        }

        const row = document.createElement('tr');
        row.id = 'no-products-row';
        const message = document.createElement('td');
        message.colSpan = 6;
        message.textContent = 'No products.';
        row.appendChild(message);
        productTableBody.appendChild(row);
    }

    // Rebuild the inventory table from the server's product catalog.
    function renderSavedProducts(savedProducts) {
        productTableBody.replaceChildren();

        if (savedProducts.length === 0) {
            showEmptyTableRow();
            return;
        }

        savedProducts.forEach(product => {
            const row = document.createElement('tr');
            row.dataset.productId = product.id;
            row.dataset.productSku = product.sku;
            row.dataset.productName = product.name.toLowerCase();
            row.dataset.productCategory = product.category.toLowerCase();
            row.dataset.lowStockThreshold = String(product.threshold);
            row.dataset.productPrice = String(product.price);
            row.dataset.productStock = String(product.stock);

            [product.name, product.category, product.sku, `${currencySymbol}${Number(product.price).toFixed(2)}`]
                .forEach(value => {
                    const cell = document.createElement('td');
                    cell.textContent = value;
                    row.appendChild(cell);
                });

            const stockCell = document.createElement('td');
            stockCell.textContent = String(product.stock);
            stockCell.classList.toggle('low-stock', product.stock <= product.threshold);
            row.appendChild(stockCell);

            const actionsCell = document.createElement('td');
            actionsCell.className = 'product-row-actions';

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'product-action-button product-edit-button';
            editButton.dataset.action = 'edit-product';
            editButton.setAttribute('aria-label', `Edit ${product.name}`);
            const editIcon = document.createElement('i');
            editIcon.className = 'bx bx-pencil';
            editIcon.setAttribute('aria-hidden', 'true');
            editButton.appendChild(editIcon);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'product-action-button product-delete-button';
            deleteButton.dataset.action = 'delete-product';
            deleteButton.setAttribute('aria-label', `Delete ${product.name}`);
            const deleteIcon = document.createElement('i');
            deleteIcon.className = 'bx bx-trash';
            deleteIcon.setAttribute('aria-hidden', 'true');
            deleteButton.appendChild(deleteIcon);

            actionsCell.append(editButton, deleteButton);
            row.appendChild(actionsCell);
            productTableBody.appendChild(row);
        });

        updateProductTable();
    }

    function resetProductForm() {
        editingRow = null;
        addProductForm.reset();
        formTitle.textContent = 'Add product';
        saveButton.textContent = 'Save';
        productError.hidden = true;
        productError.textContent = '';
    }

    // Open the dialog and focus the first field for quick data entry.
    addProductButton.addEventListener('click', () => {
        resetProductForm();
        addProductDialog.showModal();
        nameInput.focus();
    });

    document.getElementById('close-add-product').addEventListener('click', () => {
        addProductDialog.close();
        resetProductForm();
    });
    document.getElementById('cancel-add-product').addEventListener('click', () => {
        addProductDialog.close();
        resetProductForm();
    });
    addProductDialog.addEventListener('click', event => {
        if (event.target === addProductDialog) {
            addProductDialog.close();
            resetProductForm();
        }
    });
    addProductDialog.addEventListener('cancel', resetProductForm);

    // Validate the form, reject duplicate SKUs, then create a safe table row.
    addProductForm.addEventListener('submit', async event => {
        event.preventDefault();

        if (!addProductForm.reportValidity()) {
            return;
        }

        const name = nameInput.value.trim();
        const category = categoryInput.value.trim();
        const sku = skuInput.value.trim();
        const price = Number(priceInput.value);
        const stock = Number(stockInput.value);
        const threshold = Number(thresholdInput.value);

        if (!name || !sku || !category) {
            productError.textContent = 'Enter a name, category, and SKU.';
            productError.hidden = false;
            return;
        }

        const record = { name, category, sku, price, stock, threshold };
        try {
            await apiRequest(
                editingRow
                    ? `/products/${encodeURIComponent(editingRow.dataset.productId)}`
                    : '/products',
                {
                    method: editingRow ? 'PUT' : 'POST',
                    body: JSON.stringify(record)
                }
            );
            const { products: refreshedProducts } = await apiRequest('/products');
            renderSavedProducts(refreshedProducts);
        } catch (error) {
            console.error('Unable to save product to the server:', error);
            productError.textContent = error.message || 'Could not save this product.';
            productError.hidden = false;
            return;
        }

        resetProductForm();
        addProductDialog.close();
        updateProductTable();
    });

    // Filter existing inventory rows by product name/SKU and selected category.
    productSearch.addEventListener('input', updateProductTable);
    categoryFilter.addEventListener('change', updateProductTable);

    // Delegate row deletion so each newly-added product needs no separate listener.
    productTableBody.addEventListener('click', async event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const actionButton = event.target.closest('button[data-action]');
        const row = actionButton?.closest('tr[data-product-sku]');
        if (!actionButton || !row) {
            return;
        }

        if (actionButton.dataset.action === 'edit-product') {
            editingRow = row;
            nameInput.value = row.cells[0].textContent;
            categoryInput.value = row.cells[1].textContent;
            skuInput.value = row.dataset.productSku;
            priceInput.value = row.dataset.productPrice;
            stockInput.value = row.dataset.productStock;
            thresholdInput.value = row.dataset.lowStockThreshold;
            formTitle.textContent = 'Edit product';
            saveButton.textContent = 'Update';
            productError.hidden = true;
            addProductDialog.showModal();
            nameInput.focus();
            return;
        }

        if (actionButton.dataset.action === 'delete-product') {
            const productName = row.cells[0].textContent;
            const confirmed = window.confirm(
                `Delete "${productName}"? Select OK to delete or Cancel to keep it.`
            );

            if (confirmed) {
                try {
                    await apiRequest(
                        `/products/${encodeURIComponent(row.dataset.productId)}`,
                        { method: 'DELETE' }
                    );
                    const { products: refreshedProducts } = await apiRequest('/products');
                    renderSavedProducts(refreshedProducts);
                } catch (error) {
                    console.error('Unable to archive product:', error);
                    window.alert(error.message || 'Could not archive this product.');
                }
            }
        }
    });

    try {
        const { products: savedProducts } = await apiRequest('/products');
        renderSavedProducts(savedProducts);
    } catch (error) {
        console.error('Unable to load products from the server:', error);
        productError.textContent = `Could not load products. ${error.message}`;
        productError.hidden = false;
        productTableBody.replaceChildren();
        showEmptyTableRow();
    }
});


document.addEventListener('DOMContentLoaded', async () => {
    if (!await requireAuthenticatedSession()) return;

    try {
        const settings = await apiRequest('/settings');
        currencySymbol = settings.currency_symbol || currencySymbol;
        applyStoreName(settings.store_name);
    } catch (error) {
        console.error('Could not load store preferences:', error);
    }
    const formatCurrency = value => `${currencySymbol}${Number(value || 0).toFixed(2)}`;
    const parseDate = value => value ? new Date(value.replace(' ', 'T')) : null;
    const formatDate = value => {
        const date = parseDate(value);
        return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '—';
    };
    const formatRelativeDate = value => {
        const date = parseDate(value);
        if (!date || Number.isNaN(date.getTime())) return '—';

        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
        if (elapsedSeconds < 60) return 'Just now';
        if (elapsedSeconds < 3600) {
            const minutes = Math.floor(elapsedSeconds / 60);
            return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        }
        if (elapsedSeconds < 86400) {
            const hours = Math.floor(elapsedSeconds / 3600);
            return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        }
        if (elapsedSeconds < 604800) {
            const days = Math.floor(elapsedSeconds / 86400);
            return `${days} day${days === 1 ? '' : 's'} ago`;
        }
        return date.toLocaleDateString();
    };
    const addCell = (row, value) => {
        const cell = document.createElement('td');
        cell.textContent = value == null || value === '' ? '—' : String(value);
        row.appendChild(cell);
        return cell;
    };
    const addEmptyRow = (body, colspan, message) => {
        body.replaceChildren();
        const row = document.createElement('tr');
        const cell = addCell(row, message);
        cell.colSpan = colspan;
        body.appendChild(row);
    };

    const dashboardRoot = document.getElementById('dashboard');
    if (dashboardRoot) {
        apiRequest('/dashboard').then(data => {
            document.getElementById('dashboard-sales-today').textContent = formatCurrency(data.sales_today);
            document.getElementById('dashboard-transactions-today').textContent = String(data.transactions_today);
            document.getElementById('dashboard-outstanding-debts').textContent =
                formatCurrency(data.outstanding_debts);
            document.getElementById('dashboard-low-stock-count').textContent = String(data.low_stock_count);
            document.getElementById('dashboard-low-stock-badge').textContent =
                `${data.low_stock_count} items`;

            const transactionRoot = document.getElementById('dashboard-recent-transactions');
            const emptyTransactions = document.getElementById('dashboard-transactions-empty');
            const transactions = data.recent_transactions || [];
            document.getElementById('dashboard-transactions-count').textContent =
                `${transactions.length} recent`;
            emptyTransactions.hidden = transactions.length > 0;
            transactionRoot.replaceChildren();
            transactions.forEach(transaction => {
                const row = document.createElement('div');
                row.className = 'dashboard-data-row';
                [transaction.receipt, transaction.customer || 'Walk-in',
                    formatCurrency(transaction.total)].forEach(value => {
                    const cell = document.createElement('span');
                    cell.textContent = value;
                    row.appendChild(cell);
                });
                transactionRoot.appendChild(row);
            });

            const lowStockRoot = document.getElementById('dashboard-low-stock');
            const emptyLowStock = document.getElementById('dashboard-low-stock-empty');
            lowStockRoot.replaceChildren();
            emptyLowStock.hidden = data.low_stock.length > 0;
            data.low_stock.forEach(product => {
                const row = document.createElement('div');
                row.className = 'dashboard-data-row';
                [product.name, `${product.stock} left`].forEach(value => {
                    const cell = document.createElement('span');
                    cell.textContent = value;
                    row.appendChild(cell);
                });
                lowStockRoot.appendChild(row);
            });
        }).catch(error => {
            console.error('Could not load dashboard data:', error);
            document.getElementById('dashboard-transactions-empty').textContent =
                `Could not load dashboard data. ${error.message}`;
            document.getElementById('dashboard-transactions-empty').hidden = false;
        });
    }

    const debtTable = document.getElementById('debts-table-body');
    if (debtTable) {
        const debtSearch = document.getElementById('debts-search');
        const debtStatus = document.getElementById('debts-status-filter');
        const debtMessage = document.getElementById('debts-message');
        const detailsDialog = document.getElementById('debt-details-dialog');
        const paymentDialog = document.getElementById('debt-payment-dialog');
        const paymentForm = document.getElementById('debt-payment-form');
        const paymentError = document.getElementById('debt-payment-error');
        let debts = [];
        let selectedDebt = null;

        function renderDebts() {
            const term = debtSearch.value.trim().toLowerCase();
            const status = debtStatus.value;
            const filtered = debts.filter(debt =>
                (status === 'all' || debt.status === status) &&
                (`${debt.name} ${debt.customer_id} ${debt.id}`.toLowerCase().includes(term))
            );
            debtTable.replaceChildren();
            if (!filtered.length) {
                addEmptyRow(debtTable, 8, debts.length ? 'No debts match these filters.' : 'No debts found.');
                return;
            }
            filtered.forEach(debt => {
                const row = document.createElement('tr');
                row.dataset.debtId = String(debt.id);
                const customerCell = addCell(row, debt.name);
                if (debt.status === 'Paid') {
                    customerCell.classList.add('debt-customer-paid');
                }
                const updatedCell = addCell(row, '');
                const updatedAt = document.createElement('time');
                updatedAt.className = 'debt-last-update';
                updatedAt.dateTime = debt.updated_at.replace(' ', 'T');
                updatedAt.title = formatDate(debt.updated_at);
                updatedAt.textContent = formatRelativeDate(debt.updated_at);
                updatedCell.appendChild(updatedAt);
                addCell(row, debt.item_count);
                addCell(row, formatCurrency(debt.total));
                addCell(row, formatCurrency(debt.paid));
                addCell(row, formatCurrency(debt.balance));
                const statusCell = addCell(row, debt.status);
                const statusBadge = document.createElement('span');
                statusBadge.className = `debt-status-badge status-${debt.status.toLowerCase()}`;
                statusBadge.textContent = debt.status;
                statusCell.replaceChildren(statusBadge);
                const actions = document.createElement('td');
                actions.className = 'debt-row-actions';
                [
                    ['details', 'View details', 'bx-show'],
                    ...(Number(debt.balance) > 0 ? [['payment', 'Record payment', 'bx-credit-card']] : []),
                    ['print', 'Print debt', 'bx-printer'],
                    ['delete', 'Archive debt record', 'bx-trash']
                ].forEach(([action, label, icon]) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.debtAction = action;
                    button.dataset.debtId = String(debt.id);
                    button.setAttribute('aria-label', label);
                    button.title = label;
                    const glyph = document.createElement('i');
                    glyph.className = `bx ${icon}`;
                    glyph.setAttribute('aria-hidden', 'true');
                    button.appendChild(glyph);
                    actions.appendChild(button);
                });
                row.appendChild(actions);
                debtTable.appendChild(row);
            });
        }

        async function reloadDebts() {
            debtMessage.textContent = '';
            try {
                const result = await apiRequest('/debts');
                debts = result.debts;
                renderDebts();
            } catch (error) {
                console.error('Could not load debts:', error);
                addEmptyRow(debtTable, 8, `Could not load debts. ${error.message}`);
                debtMessage.textContent = error.message;
            }

            const refreshRelativeDebtTimes = () => {
                debtTable.querySelectorAll('time.debt-last-update').forEach(element => {
                    const value = element.dateTime.replace('T', ' ');
                    element.textContent = formatRelativeDate(value);
                    element.title = formatDate(value);
                });
            };
            window.setInterval(refreshRelativeDebtTimes, 30000);
        }

        function renderDebtDetails(debt) {
            document.getElementById('debt-details-customer').textContent =
                `${debt.name} · Total ${formatCurrency(debt.total)} · Paid ${formatCurrency(debt.paid)} · Balance ${formatCurrency(debt.balance)}`;
            const content = document.getElementById('debt-details-content');
            content.replaceChildren();
            const dates = new Map();
            debt.items.forEach(item => {
                const key = item.sale_date.slice(0, 10);
                if (!dates.has(key)) dates.set(key, []);
                dates.get(key).push(item);
            });
            dates.forEach((items, saleDate) => {
                const group = document.createElement('section');
                group.className = 'debt-date-group';
                const heading = document.createElement('h3');
                heading.textContent = new Date(`${saleDate}T00:00:00`).toLocaleDateString();
                group.appendChild(heading);
                const table = document.createElement('table');
                table.className = 'report-table';
                const head = document.createElement('tr');
                ['Item', 'Qty', 'Price', 'Subtotal'].forEach(label => addCell(head, label));
                const thead = document.createElement('thead');
                thead.appendChild(head);
                table.appendChild(thead);
                const tbody = document.createElement('tbody');
                items.forEach(item => {
                    const row = document.createElement('tr');
                    addCell(row, item.name);
                    addCell(row, item.quantity);
                    addCell(row, formatCurrency(item.unit_price));
                    addCell(row, formatCurrency(item.subtotal));
                    tbody.appendChild(row);
                });
                table.appendChild(tbody);
                group.appendChild(table);
                content.appendChild(group);
            });
            if (!debt.items.length) {
                const empty = document.createElement('p');
                empty.textContent = 'No linked sale items were found for this legacy debt.';
                content.appendChild(empty);
            }
            const paymentsHeading = document.createElement('h3');
            paymentsHeading.textContent = 'Payment history';
            content.appendChild(paymentsHeading);
            const paymentsList = document.createElement('ul');
            debt.payments.forEach(payment => {
                const item = document.createElement('li');
                item.textContent = `${formatDate(payment.paid_at)} — ${formatCurrency(payment.amount)}`;
                paymentsList.appendChild(item);
            });
            if (!debt.payments.length) {
                const item = document.createElement('li');
                item.textContent = 'No payments recorded.';
                paymentsList.appendChild(item);
            }
            content.appendChild(paymentsList);
        }

        debtSearch.addEventListener('input', renderDebts);
        debtStatus.addEventListener('change', renderDebts);
        debtTable.addEventListener('click', async event => {
            const button = event.target instanceof Element
                ? event.target.closest('button[data-debt-action]') : null;
            if (!button) return;
            const debtId = button.dataset.debtId;
            const debt = debts.find(item => String(item.id) === debtId);
            if (!debt) return;

            if (button.dataset.debtAction === 'payment') {
                selectedDebt = debt;
                paymentError.hidden = true;
                paymentError.textContent = '';
                document.getElementById('debt-payment-title').textContent = `Payment — ${debt.name}`;
                document.getElementById('debt-payment-balance').textContent =
                    `Outstanding balance: ${formatCurrency(debt.balance)}`;
                document.getElementById('debt-payment-amount').max = debt.balance;
                paymentForm.reset();
                paymentDialog.showModal();
            } else if (button.dataset.debtAction === 'details' ||
                button.dataset.debtAction === 'print') {
                try {
                    const result = await apiRequest(`/debts/${debtId}`);
                    renderDebtDetails(result.debt);
                    detailsDialog.showModal();
                    if (button.dataset.debtAction === 'print') {
                        window.setTimeout(() => window.print(), 50);
                    }
                } catch (error) {
                    debtMessage.textContent = `Could not load debt details. ${error.message}`;
                }
            } else if (button.dataset.debtAction === 'delete' &&
                window.confirm(`Archive ${debt.name}'s debt record? Sales and payment history will be retained.`)) {
                try {
                    await apiRequest(`/debts/${debtId}`, { method: 'DELETE' });
                    await reloadDebts();
                    debtMessage.textContent = 'Debt record archived; transaction and payment history were retained.';
                } catch (error) {
                    debtMessage.textContent = `Could not archive debt. ${error.message}`;
                }
            }
        });

        paymentForm.addEventListener('submit', async event => {
            event.preventDefault();
            if (!selectedDebt) return;
            const amount = document.getElementById('debt-payment-amount').value;
            try {
                await apiRequest(`/debts/${selectedDebt.id}/payments`, {
                    method: 'POST',
                    body: JSON.stringify({ amount })
                });
                paymentDialog.close();
                await reloadDebts();
                debtMessage.textContent = 'Payment recorded successfully.';
            } catch (error) {
                paymentError.textContent = error.message;
                paymentError.hidden = false;
            }
        });
        document.getElementById('debt-print-button').addEventListener('click', () => window.print());
        document.querySelectorAll('[data-close-dialog]').forEach(button => {
            button.addEventListener('click', () => {
                document.getElementById(button.dataset.closeDialog).close();
            });
        });
        reloadDebts();
    }

    const salesRoot = document.getElementById('sales-transactions');
    if (salesRoot) {
        const salesSearch = document.getElementById('sales-search');
        const salesPeriod = document.getElementById('sales-period');
        const salesMessage = document.getElementById('sales-message');
        const bestSellersRoot = document.getElementById('sales-best-sellers');
        async function reloadSales() {
            salesMessage.textContent = '';
            try {
                const query = new URLSearchParams({
                    period: salesPeriod.value,
                    search: salesSearch.value.trim()
                });
                const report = await apiRequest(`/reports/sales?${query}`);
                document.getElementById('sales-gross-sales').textContent = formatCurrency(report.gross_sales);
                document.getElementById('sales-cash-collected').textContent = formatCurrency(report.cash_collected);
                document.getElementById('sales-receivables').textContent = formatCurrency(report.receivables);
                document.getElementById('sales-average').textContent = formatCurrency(report.average_sale);
                salesRoot.replaceChildren();
                report.transactions.forEach(transaction => {
                    const row = document.createElement('tr');
                    addCell(row, transaction.receipt);
                    addCell(row, formatDate(transaction.created_at));
                    addCell(row, transaction.customer || 'Walk-in');
                    addCell(row, formatCurrency(transaction.total));
                    addCell(row, formatCurrency(transaction.paid));
                    addCell(row, formatCurrency(transaction.balance));
                    addCell(row, transaction.status);
                    salesRoot.appendChild(row);
                });
                if (!report.transactions.length) addEmptyRow(salesRoot, 7, 'No sales in this period.');
                bestSellersRoot.replaceChildren();
                report.best_sellers.forEach(product => {
                    const row = document.createElement('tr');
                    addCell(row, product.name);
                    addCell(row, product.units);
                    addCell(row, formatCurrency(product.gross));
                    bestSellersRoot.appendChild(row);
                });
                if (!report.best_sellers.length) addEmptyRow(bestSellersRoot, 3, 'No products sold in this period.');
            } catch (error) {
                console.error('Could not load sales report:', error);
                salesMessage.textContent = `Could not load sales report. ${error.message}`;
                addEmptyRow(salesRoot, 7, 'Sales report unavailable.');
                addEmptyRow(bestSellersRoot, 3, 'Best sellers unavailable.');
            }
        }
        let searchTimer;
        salesSearch.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(reloadSales, 250);
        });
        salesPeriod.addEventListener('change', reloadSales);
        reloadSales();
    }

    const historyRoot = document.getElementById('history-transactions');
    if (historyRoot) {
        const search = document.getElementById('history-search');
        const dateFilter = document.getElementById('history-date');
        const statusFilter = document.getElementById('history-status');
        const message = document.getElementById('history-message');
        async function reloadHistory() {
            message.textContent = '';
            const query = new URLSearchParams({
                search: search.value.trim(),
                status: statusFilter.value,
                date: dateFilter.value
            });
            try {
                const result = await apiRequest(`/transactions?${query}`);
                historyRoot.replaceChildren();
                result.transactions.forEach(transaction => {
                    const row = document.createElement('tr');
                    addCell(row, transaction.receipt);
                    addCell(row, formatDate(transaction.created_at));
                    addCell(row, transaction.customer || 'Walk-in');
                    addCell(row, transaction.type);
                    addCell(row, formatCurrency(transaction.total));
                    addCell(row, formatCurrency(transaction.paid));
                    addCell(row, formatCurrency(transaction.balance));
                    addCell(row, transaction.status);
                    historyRoot.appendChild(row);
                });
                if (!result.transactions.length) addEmptyRow(historyRoot, 8, 'No transactions match these filters.');
            } catch (error) {
                console.error('Could not load transaction history:', error);
                message.textContent = `Could not load history. ${error.message}`;
                addEmptyRow(historyRoot, 8, 'Transaction history unavailable.');
            }
        }
        let searchTimer;
        search.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(reloadHistory, 250);
        });
        dateFilter.addEventListener('change', reloadHistory);
        statusFilter.addEventListener('change', reloadHistory);
        reloadHistory();
    }

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        const settingsMessage = document.getElementById('settings-message');
        function setSettingsMessage(text, isError = false) {
            settingsMessage.textContent = text;
            settingsMessage.classList.toggle('is-error', isError);
            settingsMessage.classList.toggle('is-success', !isError);
            settingsMessage.classList.remove('is-info');
        }
        apiRequest('/settings').then(settings => {
            document.getElementById('settings-store-name').value = settings.store_name;
            document.getElementById('settings-currency-symbol').value = settings.currency_symbol;
            applyStoreName(settings.store_name);
            if (settings.configured === false) {
                setSettingsMessage(settings.notice, true);
                settingsMessage.classList.add('is-info');
            }
        }).catch(error => {
            setSettingsMessage(`Settings could not be loaded: ${error.message}`, true);
        });
        settingsForm.addEventListener('submit', async event => {
            event.preventDefault();
            setSettingsMessage('');
            try {
                const settings = {
                    store_name: document.getElementById('settings-store-name').value.trim(),
                    currency_symbol: document.getElementById('settings-currency-symbol').value.trim()
                };
                await apiRequest('/settings', {
                    method: 'PUT',
                    body: JSON.stringify(settings)
                });
                applyStoreName(settings.store_name);
                setSettingsMessage('Settings saved.');
            } catch (error) {
                setSettingsMessage(`Could not save settings. ${error.message}`, true);
            }
        });
        async function fetchExportData() {
            return apiRequest('/export');
        }
        function downloadFile(contents, mimeType, fileName) {
            const file = new Blob([contents], { type: mimeType });
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        document.getElementById('settings-export').addEventListener('click', async () => {
            setSettingsMessage('');
            try {
                const payload = await fetchExportData();
                downloadFile(JSON.stringify(payload, null, 2), 'application/json',
                    makeExportFileName('backup', 'json'));
                setSettingsMessage('JSON backup downloaded.');
            } catch (error) {
                setSettingsMessage(`Could not export JSON backup. ${error.message}`, true);
            }
        });
        document.getElementById('settings-export-csv').addEventListener('click', async () => {
            setSettingsMessage('');
            try {
                const payload = await fetchExportData();
                const columns = [
                    'record_type', 'id', 'name', 'sku', 'category', 'quantity',
                    'price', 'total', 'paid', 'balance', 'status', 'date'
                ];
                const rows = [columns];
                payload.products.forEach(product => rows.push([
                    'product', product.id, product.name, product.sku, product.category,
                    product.stock, product.price, '', '', '', product.active ? 'Active' : 'Archived', ''
                ]));
                payload.transactions.forEach(transaction => rows.push([
                    'transaction', transaction.id, transaction.customer || 'Walk-in', '', '',
                    '', '', transaction.total, transaction.paid, transaction.balance,
                    transaction.status, transaction.created_at
                ]));
                payload.debts.forEach(debt => rows.push([
                    'debt', debt.id, debt.name, '', '', '', '', debt.total, debt.paid,
                    debt.balance, debt.status, ''
                ]));
                const csvEscape = value => {
                    let text = value == null ? '' : String(value);
                    if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
                    return `"${text.replace(/"/g, '""')}"`;
                };
                const csv = `\uFEFF${rows.map(row => row.map(csvEscape).join(',')).join('\r\n')}`;
                downloadFile(csv, 'text/csv;charset=utf-8', makeExportFileName('export', 'csv'));
                setSettingsMessage('CSV file downloaded.');
            } catch (error) {
                setSettingsMessage(`Could not export CSV. ${error.message}`, true);
            }
        });

        const importFile = document.getElementById('settings-import-file');
        const importButton = document.getElementById('settings-import');
        let selectedBackup = null;
        importFile.addEventListener('change', async () => {
            selectedBackup = null;
            importButton.disabled = true;
            const file = importFile.files[0];
            if (!file) return;
            try {
                selectedBackup = JSON.parse(await file.text());
                importButton.disabled = false;
                setSettingsMessage('Backup file loaded. Restoring it will replace this browser’s POS records.');
            } catch (error) {
                setSettingsMessage(`Could not read the backup file. ${error.message}`, true);
            }
        });
        importButton.addEventListener('click', async () => {
            if (!selectedBackup) return;
            if (!window.confirm(
                'Restore this backup? It will replace this browser’s products, transactions, debts, and settings. Accounts and login will remain unchanged.'
            )) return;
            importButton.disabled = true;
            setSettingsMessage('');
            try {
                await apiRequest('/import', {
                    method: 'POST',
                    body: JSON.stringify(selectedBackup)
                });
                window.location.reload();
            } catch (error) {
                importButton.disabled = false;
                setSettingsMessage(`Could not restore backup. ${error.message}`, true);
            }
        });
    }
});
