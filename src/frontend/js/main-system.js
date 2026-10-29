// POS products currently come from the static cards in funnel/pos.html.
// Product API fetching is disconnected while the backend is being revised.
document.addEventListener('DOMContentLoaded', () => {
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
    document.title = `${storeName} | Point of Sales`;

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
        productCards.length === 0 ||
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

    const orderItems = document.createElement('div');
    orderItems.className = 'order-items';
    orderItems.id = 'order-items';
    orderPanel.insertBefore(orderItems, orderEmpty);

    const products = new Map();
    const cart = new Map();
    let paymentType = 'full';
    let receiptSequence = 1001;
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
        return `₱${(amountInCents / 100).toFixed(2)}`;
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
            commands.push(`0.83 0.89 0.90 RG 0.7 w ${padding} ${y} m ${pageWidth - padding} ${y} l S`);
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

        pdfRect(0, 0, pageWidth, pageHeight, [0.97, 0.985, 0.98]);
        pdfRect(0, 0, pageWidth, 105, [0.02, 0.13, 0.18]);
        pdfRect(padding, 121, contentWidth, pageHeight - 145, [1, 1, 1]);
        pdfText(receipt.storeName, padding + 2, 28, 21, [1, 1, 1], true);
        pdfText('SALES RECEIPT', padding + 2, 58, 10, [0.55, 0.92, 0.82], true);
        pdfText(receipt.number, pageWidth - padding - 92, 31, 12, [1, 1, 1], true);
        pdfText(receipt.date, padding + 2, 78, 9, [0.88, 0.94, 0.95]);

        cursor = 145;
        pdfText(`Receipt ${receipt.number}`, padding + 2, cursor, 10, [0.32, 0.40, 0.43], true);
        pdfText(receipt.date, padding + 2, cursor + 17, 9, [0.32, 0.40, 0.43]);
        cursor += 39;
        if (receipt.customerName) {
            pdfText(`Customer: ${receipt.customerName}`, padding + 2, cursor, 10, [0.06, 0.13, 0.16]);
            cursor += 22;
        }

        pdfRule(cursor);
        cursor += 18;
        pdfText('ITEM', padding + 2, cursor, 9, [0.32, 0.40, 0.43], true);
        pdfText('AMOUNT', pageWidth - padding - 58, cursor, 9, [0.32, 0.40, 0.43], true);
        cursor += 18;

        itemRows.forEach(item => {
            item.nameLines.forEach((line, index) => {
                pdfText(line, padding + 2, cursor + index * 12, 10, [0.06, 0.13, 0.16]);
            });
            const amount = formatMoney(item.unitPriceCents * item.quantity);
            pdfText(amount, pageWidth - padding - 70, cursor, 10, [0.06, 0.13, 0.16], true);
            cursor += 16 + (item.nameLines.length - 1) * 12;
            pdfText(`${item.quantity} x ${formatMoney(item.unitPriceCents)}`, padding + 2, cursor, 8, [0.32, 0.40, 0.43]);
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
            pdfText(label, padding + 2, cursor, emphasize ? 11 : 10, [0.06, 0.13, 0.16], emphasize);
            pdfText(amount, pageWidth - padding - 70, cursor, emphasize ? 11 : 10, [0.06, 0.13, 0.16], emphasize);
            cursor += 19;
        });

        cursor += 5;
        pdfRule(cursor);
        pdfText('Thank you for your purchase!', padding + 2, cursor + 15, 10, [0.02, 0.43, 0.31], true);

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
        const filename = `${receipt.storeName}-${receipt.number}`
            .replace(/[^a-z0-9-]+/gi, '-')
            .replace(/^-|-$/g, '');
        link.download = `${filename}.pdf`;
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
    checkoutForm.addEventListener('submit', event => {
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
        latestReceipt = {
            number: `R-${receiptSequence++}`,
            date: new Date().toLocaleString('en-US'),
            storeName,
            paymentType,
            paymentMethod: paymentType === 'full' ? paymentMethodLabel : '',
            customerName: paymentType === 'full' ? '' : customerName,
            totalCents,
            paidCents,
            balanceCents,
            changeCents,
            items: completedItems.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unitPriceCents: Math.round(item.price * 100)
            }))
        };

        // Commit the sale to this page's in-memory stock state and clear the active order.
        completedItems.forEach(item => {
            const product = products.get(item.id);
            product.stock -= item.quantity;
        });
        cart.clear();
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

        if (!card.id || !name || !Number.isFinite(price) ||
            !Number.isInteger(stock) || stock < 0) {
            console.error('Product card needs a unique id, name, valid price, and stock:', card);
            return;
        }

        if (products.has(card.id)) {
            console.error(`Duplicate product card id: ${card.id}`);
            return;
        }

        products.set(card.id, { id: card.id, name, price, stock, card });

        card.addEventListener('click', () => {
            const product = products.get(card.id);
            const item = cart.get(card.id);
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
