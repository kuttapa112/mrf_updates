const state = {
    currentUser: null,
    activeOrder: null,
    allCountries: [],
    currentFilter: 'all',
    currentService: 'whatsapp',
    currentAdminTab: 'payment-requests',
    paymentHistoryRefreshInterval: null,
    otpInterval: null,
    timerInterval: null,
    adminRefreshInterval: null,
    adminAlertInterval: null,
    adminAlertTimeout: null,
    lastPendingCount: 0,
    theme: 'light',
    otpPollInFlight: false,
    expireRequestInFlight: false
};

const serviceMeta = {
    whatsapp: {
        label: 'WhatsApp',
        shortLabel: 'WA',
        catalogTitle: 'Available WhatsApp Numbers',
        description: 'Choose a country below and order in one tap.',
        iconClass: 'fa-brands fa-whatsapp',
        iconTone: 'text-[#25D366]',
        wrapperTone: 'bg-emerald-500/10 ring-1 ring-emerald-400/20'
    },
    facebook: {
        label: 'Facebook',
        shortLabel: 'FB',
        catalogTitle: 'Available Facebook Numbers',
        description: 'Pick a country below and buy instantly.',
        iconClass: 'fa-brands fa-facebook',
        iconTone: 'text-[#1877F2]',
        wrapperTone: 'bg-blue-500/10 ring-1 ring-blue-400/20'
    },
    instagram: {
        label: 'Instagram',
        shortLabel: 'IG',
        catalogTitle: 'Available Instagram Numbers',
        description: 'Pick a country below and order in one tap.',
        iconClass: 'fa-brands fa-instagram',
        iconTone: 'service-gradient-instagram',
        wrapperTone: 'bg-pink-500/10 ring-1 ring-pink-400/20'
    },
    snapchat: {
        label: 'Snapchat',
        shortLabel: 'SC',
        catalogTitle: 'Available Snapchat Numbers',
        description: 'Choose a country below and purchase a number quickly.',
        iconClass: 'fa-brands fa-snapchat',
        iconTone: 'text-[#FFFC00] drop-shadow-[0_0_10px_rgba(255,252,0,0.25)]',
        wrapperTone: 'bg-yellow-300/10 ring-1 ring-yellow-300/20'
    },
    google: {
        label: 'Google / Gmail / YouTube',
        shortLabel: 'GO',
        catalogTitle: 'Available Google Numbers',
        description: 'Choose a country below and order a Google-family OTP number.',
        iconClass: 'fa-brands fa-google',
        iconTone: 'service-gradient-google',
        wrapperTone: 'bg-white/10 ring-1 ring-white/10'
    }
};

const notificationSound = new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');

const qs = (id) => document.getElementById(id);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));
const THEME_STORAGE_KEY = 'mrf-theme';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value);
}

function getServiceMeta(serviceType) {
    return serviceMeta[serviceType] || serviceMeta.whatsapp;
}

function renderServiceLogo(serviceType, size = 'md') {
    const meta = getServiceMeta(serviceType);
    const sizeMap = {
        sm: 'h-9 w-9 text-base rounded-xl',
        md: 'h-11 w-11 text-lg rounded-2xl',
        lg: 'h-12 w-12 text-xl rounded-2xl',
        xl: 'h-14 w-14 text-2xl rounded-3xl'
    };
    return `<span class="inline-flex ${sizeMap[size] || sizeMap.md} items-center justify-center ${meta.wrapperTone}"><i class="${meta.iconClass} ${meta.iconTone}"></i></span>`;
}

function formatMoney(value) {
    return `${Number(value || 0).toFixed(0)} PKR`;
}

function formatMoneyPrecise(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0 PKR';
    return `${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)} PKR`;
}

function formatRelativeTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString();
}

function formatStatus(status) {
    return String(status || 'pending')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusTone(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved' || normalized === 'completed' || normalized === 'otp_received') {
        return 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20';
    }
    if (normalized === 'expired_refunded') {
        return 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20';
    }
    if (normalized === 'cancelled' || normalized === 'rejected') {
        return 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20';
    }
    if (normalized === 'active') {
        return 'bg-blue-500/10 text-blue-200 ring-1 ring-blue-400/20';
    }
    return 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/20';
}

function getCountryFlag(country) {
    return country?.flag || '🌐';
}

function renderStatusBadge(status) {
    return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${getStatusTone(status)}">${escapeHtml(formatStatus(status))}</span>`;
}

function renderTypeBadge(type) {
    const normalized = String(type || 'deposit').toLowerCase();
    const tone = normalized === 'deduction'
        ? 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20'
        : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20';
    return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${tone}">${escapeHtml(formatStatus(normalized))}</span>`;
}

function getUploadUrl(fileName) {
    return fileName ? `/uploads/${encodeURIComponent(fileName)}` : '';
}

function renderAdminTable(headers, rowsMarkup, minWidthClass = 'min-w-[860px]') {
    return `
        <div class="${minWidthClass}">
            <table class="table-auto w-full text-left text-sm text-slate-200">
                <thead>
                    <tr>
                        ${headers.map((header, index) => `
                            <th class="bg-slate-800/95 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 ${index === 0 ? 'rounded-l-2xl' : ''} ${index === headers.length - 1 ? 'rounded-r-2xl' : ''}">${escapeHtml(header)}</th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>${rowsMarkup}</tbody>
            </table>
        </div>
    `;
}

function renderEmptyState(title, description) {
    return `
        <div class="rounded-[28px] border border-dashed border-white/15 bg-slate-950/45 p-6 text-center text-slate-300">
            <div class="text-lg font-semibold text-white">${escapeHtml(title)}</div>
            <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-slate-300">
                <i class="fa-solid fa-inbox text-lg"></i>
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-400">${escapeHtml(description)}</p>
        </div>
    `;
}

function showToast(message, type = 'info', duration = 4000, options = {}) {
    const wrap = qs('toast-wrap');
    if (!wrap) return;
    const toneMap = {
        success: 'border-emerald-400/30 bg-emerald-500 text-white',
        error: 'border-rose-400/30 bg-rose-500 text-white',
        info: 'border-blue-400/30 bg-blue-500 text-white'
    };
    const { dismissLabel = '', onDismiss = null } = options || {};
    const toast = document.createElement('div');
    toast.className = `toast-card ${toneMap[type] || toneMap.info}`;
    let removed = false;
    let timeoutId = null;
    const dismissToast = () => {
        if (removed) return;
        removed = true;
        if (typeof onDismiss === 'function') {
            try {
                onDismiss();
            } catch {
            }
        }
        toast.classList.add('opacity-0', 'translate-y-2');
        window.setTimeout(() => toast.remove(), 220);
    };
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="mt-0.5 text-sm"><i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i></div>
            <div class="flex-1 text-sm font-medium leading-6">${escapeHtml(message)}</div>
            ${dismissLabel ? `<button type="button" class="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90" data-toast-dismiss>${escapeHtml(dismissLabel)}</button>` : ''}
        </div>
    `;
    wrap.appendChild(toast);
    if (dismissLabel) {
        toast.querySelector('[data-toast-dismiss]')?.addEventListener('click', () => {
            if (timeoutId) window.clearTimeout(timeoutId);
            dismissToast();
        });
    }
    timeoutId = window.setTimeout(dismissToast, duration);
    return toast;
}

function setLoading(button, text) {
    if (!button) return;
    button.dataset.original = button.innerHTML;
    button.innerHTML = `<span class="inline-flex items-center gap-2"><i class="fa-solid fa-spinner animate-spin"></i><span>${escapeHtml(text)}</span></span>`;
    button.disabled = true;
}

function resetLoading(button) {
    if (!button) return;
    if (button.dataset.original) {
        button.innerHTML = button.dataset.original;
    }
    button.disabled = false;
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: 'include'
    });
    if (!response.ok) {
        throw new Error(await response.text());
    }
    return response.json();
}

async function requestBrowserNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        try {
            await Notification.requestPermission();
        } catch {
        }
    }
}

function browserNotify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try {
            new Notification(title, { body });
        } catch {
        }
    }
}

function openModal(id) {
    const modal = qs(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function clearPaymentFormError() {
    const errorBox = qs('payment-form-error');
    if (!errorBox) return;
    errorBox.textContent = '';
    errorBox.classList.remove('show');
}

function showPaymentFormError(message) {
    const errorBox = qs('payment-form-error');
    if (!errorBox) {
        showToast(message, 'error');
        return;
    }
    errorBox.textContent = message;
    errorBox.classList.add('show');
}

function showPaymentTopAlert() {
    qs('payment-top-alert')?.classList.remove('hidden');
}

function hidePaymentTopAlert() {
    qs('payment-top-alert')?.classList.add('hidden');
}

function resetPaymentModalState() {
    qs('addFundsForm')?.reset();
    qs('payment-form-view')?.classList.remove('hidden');
    clearPaymentFormError();
    if (qs('payment-screenshot-name')) {
        qs('payment-screenshot-name').textContent = 'Payment screenshot upload کریں';
    }
}

function openPaymentModal() {
    resetPaymentModalState();
    openModal('payment-modal');
}

function closeModal(id) {
    const modal = qs(id);
    if (!modal) return;
    modal.classList.add('hidden');
    if (id === 'payment-modal') {
        resetPaymentModalState();
    }
    if (!document.querySelector('.app-modal:not(.hidden)')) {
        document.body.classList.remove('overflow-hidden');
    }
}

function updateSidebarVisibility(forceClose = false) {
    const sidebar = qs('sidebar');
    const overlay = qs('sidebar-overlay');
    if (!sidebar || !overlay) return;
    if (forceClose) {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
        return;
    }
    sidebar.classList.toggle('open');
    overlay.classList.toggle('hidden');
}

function getThemeIconMarkup(theme) {
    if (theme === 'dark') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2.5v2.5"></path><path d="M12 19v2.5"></path><path d="M4.93 4.93l1.77 1.77"></path><path d="M17.3 17.3l1.77 1.77"></path><path d="M2.5 12H5"></path><path d="M19 12h2.5"></path><path d="M4.93 19.07l1.77-1.77"></path><path d="M17.3 6.7l1.77-1.77"></path></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path></svg>';
}

function applyTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    state.theme = normalized;
    document.body.classList.toggle('dark-mode', normalized === 'dark');
    qs('theme-toggle-icon').innerHTML = getThemeIconMarkup(normalized);
    qs('theme-toggle').setAttribute('aria-label', normalized === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    try {
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
    }
}

function initializeTheme() {
    let savedTheme = 'light';
    try {
        savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
    } catch {
    }
    applyTheme(savedTheme);
}

function toggleTheme() {
    applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
}

function syncAccountShortcutButtons() {
    const isLoggedIn = Boolean(state.currentUser);
    qs('header-account-button')?.classList.toggle('hidden', !isLoggedIn);
    qs('sidebar-account-button')?.classList.toggle('hidden', !isLoggedIn);
}

function openAccountDetails() {
    if (!state.currentUser) {
        showToast('Please login first', 'info');
        return;
    }
    const card = qs('account-details-card');
    if (!card) return;
    card.classList.remove('hidden');
    updateSidebarVisibility(true);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const previousShadow = card.style.boxShadow;
    card.style.boxShadow = document.body.classList.contains('dark-mode')
        ? '0 0 0 2px rgba(96,165,250,0.35), 0 20px 60px rgba(15,23,42,0.35)'
        : '0 0 0 2px rgba(59,130,246,0.22), 0 20px 60px rgba(148,163,184,0.18)';
    window.setTimeout(() => {
        card.style.boxShadow = previousShadow;
    }, 1600);
}

function hideAccountDetails() {
    qs('account-details-card')?.classList.add('hidden');
}

function syncServiceButtons() {
    qsa('[data-service]').forEach((button) => {
        button.classList.toggle('active', button.dataset.service === state.currentService);
    });
}

function hydrateStaticServiceIcons() {
    qsa('[data-service-icon]').forEach((slot) => {
        const serviceType = slot.dataset.serviceIcon;
        slot.innerHTML = renderServiceLogo(serviceType, slot.dataset.logoSize || 'md');
    });
}

function setAdminTab(tab) {
    state.currentAdminTab = tab;
    qsa('[data-admin-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.adminTab === tab);
    });
    qsa('[data-admin-panel]').forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.adminPanel !== tab);
    });
}

function updateHero() {
    const meta = getServiceMeta(state.currentService);
    qs('hero-title').textContent = meta.catalogTitle || `Available ${meta.label} Numbers`;
    qs('hero-description').textContent = meta.description;
    qs('hero-service-icon').innerHTML = renderServiceLogo(state.currentService, 'xl');
}

function renderCountries() {
    const container = qs('country-list');
    const search = qs('country-search').value.trim().toLowerCase();
    let filtered = [...state.allCountries];
    if (search) {
        filtered = filtered.filter((country) => country.name.toLowerCase().includes(search));
    }
    if (state.currentFilter === 'cheap') {
        filtered = filtered.filter((country) => Number(country.price) <= 250);
    } else if (state.currentFilter === 'premium') {
        filtered = filtered.filter((country) => Number(country.price) >= 300);
    }
    if (!filtered.length) {
        const message = state.allCountries.length
            ? 'Try a different search term or pricing filter.'
            : 'No countries are configured for this service yet.';
        container.innerHTML = renderEmptyState('No countries found', message);
        updateHero();
        return;
    }
    container.innerHTML = `
        <div class="overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/55">
            <div class="hidden grid-cols-[56px_minmax(0,1fr)_140px_120px] gap-3 border-b border-slate-700/80 bg-slate-900/90 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:grid">
                <div>Flag</div>
                <div>Country</div>
                <div class="text-right">Price</div>
                <div class="text-right">Action</div>
            </div>
            ${filtered.map((country, index) => `
                <div class="grid grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[56px_minmax(0,1fr)_140px_120px] sm:gap-3 sm:px-4 ${index !== filtered.length - 1 ? 'border-b border-slate-700/80' : ''}">
                    <div class="flex items-center justify-center text-lg sm:text-2xl">${escapeHtml(getCountryFlag(country))}</div>
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-white">${escapeHtml(country.name)}</div>
                        <div class="mt-1 truncate text-xs text-slate-400">${escapeHtml(country.code || 'N/A')}</div>
                    </div>
                    <div class="text-right text-sm font-bold text-white whitespace-nowrap">${formatMoney(country.price)}</div>
                    <div class="flex justify-end">
                        <button class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white whitespace-nowrap transition hover:bg-blue-500" data-action="buy-country" data-country-name="${escapeAttr(country.name)}" data-country-id="${escapeAttr(country.countryId)}">Buy Number</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    updateHero();
}

async function loadCountries() {
    try {
        const endpoint = state.currentService === 'whatsapp'
            ? '/api/countries'
            : `/api/services/${encodeURIComponent(state.currentService)}/countries`;
        state.allCountries = await fetchJSON(endpoint);
        renderCountries();
    } catch (err) {
        state.allCountries = [];
        renderCountries();
        showToast(err.message || 'Failed to load countries', 'error');
    }
}

function renderOrderButtons(order) {
    const container = qs('order-buttons');
    if (!container) return;
    if (order.otp_code) {
        container.innerHTML = `
            <button class="rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400" data-action="complete-order">Complete Order</button>
            <button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10" data-action="copy-otp">Copy OTP</button>
            <button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10" data-action="close-order-inline">Close</button>
        `;
        return;
    }
    if (order.order_status !== 'active' && order.order_status !== 'otp_received') {
        container.innerHTML = `
            <button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10" data-action="close-order-inline">Close</button>
        `;
        return;
    }
    const cancelEnabled = new Date() >= new Date(order.cancel_available_at);
    container.innerHTML = `
        <button class="rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400" data-action="replace-order">Replace Number</button>
        <button class="rounded-xl ${cancelEnabled ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20 hover:bg-rose-400' : 'border border-white/10 bg-white/5 text-slate-500'} px-3 py-2.5 text-sm font-semibold transition" data-action="cancel-order" ${cancelEnabled ? '' : 'disabled'}>${cancelEnabled ? 'Cancel & Refund' : 'Cancel Locked'}</button>
        <button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10" data-action="close-order-inline">Close</button>
    `;
}

function updateTimerDisplay(order) {
    const now = new Date();
    const expiry = new Date(order.expires_at || new Date(new Date(order.created_at).getTime() + 25 * 60 * 1000));
    const cancelAt = new Date(order.cancel_available_at || new Date(new Date(order.created_at).getTime() + 60 * 1000));
    const expiryDiff = Math.max(0, expiry - now);
    const cancelDiff = Math.max(0, cancelAt - now);
    const expiryMins = Math.floor(expiryDiff / 60000);
    const expirySecs = Math.floor((expiryDiff % 60000) / 1000);
    const cancelMins = Math.floor(cancelDiff / 60000);
    const cancelSecs = Math.floor((cancelDiff % 60000) / 1000);
    qs('order-timer').textContent = expiryDiff <= 0 ? 'Expired' : `${expiryMins}:${String(expirySecs).padStart(2, '0')}`;
    qs('order-cancel-timer').textContent = cancelDiff <= 0 ? 'Unlocked' : `${cancelMins}:${String(cancelSecs).padStart(2, '0')}`;
}

function updateOrderVisual(order) {
    const meta = getServiceMeta(order.service_type);
    qs('order-country-title').textContent = `${order.country} • ${meta.label}`;
    qs('order-service-logo').innerHTML = renderServiceLogo(order.service_type, 'lg');
    qs('order-status-pill').className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(order.order_status)}`;
    qs('order-status-pill').textContent = formatStatus(order.order_status || 'active');
    qs('order-price-pill').textContent = formatMoney(order.price);
    qs('order-created-pill').textContent = formatRelativeTime(order.created_at);
    qs('order-number').textContent = order.phone_number || 'Processing...';
    const checkOtpButton = qs('check-otp-btn');
    if (order.otp_code) {
        qs('order-otp').classList.remove('hidden');
        qs('order-waiting').classList.add('hidden');
        qs('order-expired-info').classList.add('hidden');
        qs('otp-value').textContent = order.otp_code;
        checkOtpButton.disabled = true;
        checkOtpButton.textContent = 'OTP Received';
        checkOtpButton.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
        qs('order-otp').classList.add('hidden');
        if (order.order_status === 'active') {
            qs('order-waiting').classList.remove('hidden');
            qs('order-expired-info').classList.add('hidden');
            checkOtpButton.disabled = false;
            checkOtpButton.textContent = 'Check OTP Now';
            checkOtpButton.classList.remove('opacity-60', 'cursor-not-allowed');
        } else {
            qs('order-waiting').classList.add('hidden');
            qs('order-expired-info').classList.remove('hidden');
            qs('order-expired-message').textContent = order.order_status === 'expired_refunded'
                ? 'Time expired. Your money has been returned to your wallet.'
                : order.order_status === 'cancelled'
                    ? 'This order was cancelled and refunded to your wallet.'
                    : 'This order is no longer active.';
            checkOtpButton.disabled = true;
            checkOtpButton.textContent = order.order_status === 'expired_refunded' ? 'Refund Completed' : 'Order Closed';
            checkOtpButton.classList.add('opacity-60', 'cursor-not-allowed');
        }
        qs('otp-value').textContent = '------';
    }
    renderOrderButtons(order);
    updateTimerDisplay(order);
}

function stopOrderIntervals() {
    if (state.otpInterval) window.clearInterval(state.otpInterval);
    if (state.timerInterval) window.clearInterval(state.timerInterval);
    state.otpInterval = null;
    state.timerInterval = null;
    state.otpPollInFlight = false;
}

async function refreshActiveOrderState(orderId) {
    const refreshed = await fetchJSON(`/api/orders/${orderId}`);
    state.activeOrder = refreshed;
    updateOrderVisual(refreshed);
    return refreshed;
}

async function handleExpiredOrder(orderId, message = 'Time expired. Your money has been returned to your wallet.') {
    if (state.expireRequestInFlight) return true;
    state.expireRequestInFlight = true;
    try {
        await refreshActiveOrderState(orderId);
        stopOrderIntervals();
        showToast(message, 'success', 6000);
        await refreshUserInfo();
        return true;
    } catch (err) {
        showToast(err.message || message, 'info', 6000);
        return false;
    } finally {
        state.expireRequestInFlight = false;
    }
}

async function requestOrderExpiry(orderId) {
    if (state.expireRequestInFlight) return false;
    state.expireRequestInFlight = true;
    try {
        const result = await fetchJSON(`/api/orders/${orderId}/expire`, {
            method: 'POST'
        });
        const refreshed = await refreshActiveOrderState(orderId);
        if (result.expired || refreshed.order_status !== 'active') {
            stopOrderIntervals();
        }
        if (result.expired) {
            showToast(result.message || 'Time expired. Your money has been returned to your wallet.', 'success', 6000);
            await refreshUserInfo();
        }
        return Boolean(result.expired);
    } catch (err) {
        showToast(err.message || 'Could not update order expiry', 'error');
        return false;
    } finally {
        state.expireRequestInFlight = false;
    }
}

async function tickActiveOrderTimer() {
    if (!state.activeOrder) return;
    updateTimerDisplay(state.activeOrder);
    if (state.activeOrder.otp_code || ['cancelled', 'completed', 'expired_refunded'].includes(state.activeOrder.order_status)) {
        stopOrderIntervals();
        return;
    }
    const expired = state.activeOrder.expires_at && new Date() >= new Date(state.activeOrder.expires_at);
    if (expired && state.activeOrder.order_status === 'active' && !state.activeOrder.otp_received) {
        await requestOrderExpiry(state.activeOrder.id);
    }
}

async function pollOtp(orderId, silent = false) {
    if (state.otpPollInFlight) return false;
    state.otpPollInFlight = true;
    try {
        const result = await fetchJSON(`/api/orders/${orderId}/otp`);
        if (result.received) {
            await refreshActiveOrderState(orderId);
            stopOrderIntervals();
            notificationSound.play().catch(() => {});
            showToast('OTP received successfully', 'success');
            await refreshUserInfo();
            return true;
        }
        if (result.expired) {
            await handleExpiredOrder(orderId, result.message || 'Time expired. Your money has been returned to your wallet.');
            return true;
        }
        if (result.inactive) {
            await refreshActiveOrderState(orderId);
            stopOrderIntervals();
            return true;
        }
        if (!silent) {
            showToast('No OTP yet. Still waiting...', 'info');
        }
        return false;
    } catch (err) {
        if (!silent) {
            showToast(err.message || 'OTP check failed', 'error');
        }
        return false;
    } finally {
        state.otpPollInFlight = false;
    }
}

async function openOrderModal(orderId) {
    try {
        closeModal('active-orders-modal');
        const order = await fetchJSON(`/api/orders/${orderId}`);
        state.activeOrder = order;
        updateOrderVisual(order);
        openModal('order-modal');
        stopOrderIntervals();
        if (order.otp_code || order.order_status !== 'active') return;
        state.otpInterval = window.setInterval(() => {
            if (!state.activeOrder || state.activeOrder.order_status !== 'active') return;
            void pollOtp(state.activeOrder.id, true);
        }, 5000);
        state.timerInterval = window.setInterval(() => {
            void tickActiveOrderTimer();
        }, 1000);
    } catch (err) {
        showToast(err.message || 'Could not load order details', 'error');
    }
}

function closeOrderModal() {
    closeModal('order-modal');
    stopOrderIntervals();
    state.activeOrder = null;
}

function startAdminAlertLoop() {
    stopAdminAlertLoop();
    try {
        notificationSound.pause();
        notificationSound.currentTime = 0;
    } catch {
    }
    notificationSound.play().catch(() => {});
    state.adminAlertInterval = window.setInterval(() => {
        try {
            notificationSound.currentTime = 0;
        } catch {
        }
        notificationSound.play().catch(() => {});
    }, 5000);
    state.adminAlertTimeout = window.setTimeout(() => {
        stopAdminAlertLoop();
    }, 30000);
}

function stopAdminAlertLoop() {
    if (state.adminAlertInterval) window.clearInterval(state.adminAlertInterval);
    if (state.adminAlertTimeout) window.clearTimeout(state.adminAlertTimeout);
    state.adminAlertInterval = null;
    state.adminAlertTimeout = null;
    try {
        notificationSound.pause();
        notificationSound.currentTime = 0;
    } catch {
    }
}

function renderActiveOrders(orders) {
    const container = qs('active-orders-list');
    const activeOrders = orders.filter((order) => order.order_status === 'active' || order.order_status === 'otp_received');
    qs('active-orders-pill-label').textContent = `Active Orders (${activeOrders.length})`;
    if (!activeOrders.length) {
        container.innerHTML = renderEmptyState('No active orders', 'Your active numbers will appear here with live OTP tracking and action buttons.');
        return;
    }
    container.innerHTML = activeOrders.map((order) => {
        const meta = getServiceMeta(order.service_type);
        return `
            <article class="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-start gap-3">
                        ${renderServiceLogo(order.service_type, 'sm')}
                        <div>
                            <div class="text-sm font-semibold text-white">${escapeHtml(order.country)}</div>
                            <div class="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">${escapeHtml(meta.label)}</div>
                        </div>
                    </div>
                    <span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${getStatusTone(order.otp_code ? 'otp_received' : order.order_status)}">${order.otp_code ? 'OTP Ready' : formatStatus(order.order_status)}</span>
                </div>
                <div class="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">${escapeHtml(order.phone_number || 'Processing...')}</div>
                <div class="mt-4 flex flex-wrap gap-2">
                    <button class="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400" data-action="view-order" data-order-id="${escapeAttr(order.id)}">
                        <i class="fa-solid fa-eye"></i>
                        <span>View Details</span>
                    </button>
                    ${order.phone_number ? `<button class="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10" data-action="copy-number" data-value="${escapeAttr(order.phone_number)}"><i class="fa-regular fa-copy"></i><span>Copy Number</span></button>` : ''}
                </div>
            </article>
        `;
    }).join('');
}

function renderAdminStats(stats) {
    const container = qs('admin-stats-list');
    if (!container) return;
    const rows = `
        <tr class="border-b border-slate-800/80 align-top last:border-b-0">
            <td class="px-4 py-3 whitespace-nowrap font-semibold text-white">${escapeHtml(formatMoneyPrecise(stats.totalDeposits))}</td>
            <td class="px-4 py-3 whitespace-nowrap font-semibold text-white">${escapeHtml(formatMoneyPrecise(stats.totalApiCost))}</td>
            <td class="px-4 py-3 whitespace-nowrap font-semibold text-emerald-300">${escapeHtml(formatMoneyPrecise(stats.totalProfit))}</td>
        </tr>
    `;
    container.innerHTML = renderAdminTable(
        ['Total Deposits', 'Total API Cost', 'Total Profit'],
        rows,
        'min-w-[760px]'
    );
}

function renderAdminOrders(orders) {
    const container = qs('admin-orders-list');
    if (!orders.length) {
        container.innerHTML = renderEmptyState('No orders yet', 'Recent orders will appear here for quick admin review.');
        return;
    }
    const rows = orders.map((order) => {
        const meta = getServiceMeta(order.service_type);
        const providerCostValue = Number(order.provider_cost_pkr || 0);
        const hasFinancials = order.profit_pkr != null || providerCostValue > 0;
        const providerCostText = hasFinancials ? formatMoneyPrecise(providerCostValue) : 'N/A';
        const profitText = order.profit_pkr != null ? formatMoneyPrecise(order.profit_pkr) : 'N/A';
        return `
            <tr class="border-b border-slate-800/80 align-top last:border-b-0">
                <td class="px-4 py-3 font-medium text-white break-all">${escapeHtml(order.user_email || '—')}</td>
                <td class="px-4 py-3 font-medium text-slate-100">${escapeHtml(meta.label)}</td>
                <td class="px-4 py-3 font-medium text-slate-200">${escapeHtml(order.phone_number || 'Pending')}</td>
                <td class="px-4 py-3 font-semibold text-white whitespace-nowrap">${formatMoneyPrecise(order.price)}</td>
                <td class="px-4 py-3 whitespace-nowrap font-semibold ${hasFinancials ? 'text-slate-200' : 'text-slate-400'}">${escapeHtml(providerCostText)}</td>
                <td class="px-4 py-3 whitespace-nowrap font-semibold ${order.profit_pkr != null ? 'text-emerald-300' : 'text-slate-400'}">${escapeHtml(profitText)}</td>
                <td class="px-4 py-3">${renderStatusBadge(order.order_status || 'pending')}</td>
            </tr>
        `;
    }).join('');
    container.innerHTML = renderAdminTable(
        ['User Email', 'Service', 'Number', 'Site Price', 'API Cost', 'Profit (Green)', 'Status'],
        rows,
        'min-w-[1120px]'
    );
}

function syncSidebarPendingPayment(requests) {
    const card = qs('sidebar-payment-pending-card');
    const text = qs('sidebar-payment-pending-text');
    if (!card || !text) return;
    const pendingRequests = (requests || []).filter((request) => String(request.status || '').toLowerCase() === 'pending');
    if (!pendingRequests.length) {
        card.classList.add('hidden');
        text.textContent = 'Payment Pending: 0 PKR';
        return;
    }
    const totalPendingAmount = pendingRequests.reduce((sum, request) => sum + Number(request.amount || 0), 0);
    text.textContent = `Payment Pending: ${formatMoneyPrecise(totalPendingAmount)}`;
    card.classList.remove('hidden');
}

function renderPaymentHistoryCards(requests) {
    const container = qs('payment-history-list');
    if (!container) return;
    if (!requests.length) {
        container.innerHTML = renderEmptyState('No payment requests yet', 'Your submitted add-money requests will appear here after you send an Easypaisa payment.');
        return;
    }
    container.innerHTML = requests.map((request) => {
        const proofButton = request.screenshot ? `
            <button class="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10" data-action="view-payment-proof" data-image="${escapeAttr(getUploadUrl(request.screenshot))}" data-user="${escapeAttr(request.user_name || 'Customer')}" data-email="${escapeAttr(request.user_email || 'Unknown email')}" data-amount="${escapeAttr(formatMoneyPrecise(request.amount))}" data-status="${escapeAttr(formatStatus(request.status))}">
                <i class="fa-regular fa-image"></i>
                <span>View Proof</span>
            </button>
        ` : '';
        return `
            <article class="payment-history-card ${escapeAttr(request.status || 'pending')} rounded-[24px] border border-white/10 bg-slate-950/55 p-5">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="text-xs uppercase tracking-[0.2em] text-slate-500">Submitted</div>
                        <div class="mt-2 text-sm font-semibold text-white">${escapeHtml(formatRelativeTime(request.created_at))}</div>
                    </div>
                    ${renderStatusBadge(request.status || 'pending')}
                </div>
                <div class="mt-4 space-y-3">
                    <div class="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><span class="text-sm text-slate-400">Amount</span><span class="text-sm font-semibold text-white">${escapeHtml(formatMoneyPrecise(request.amount))}</span></div>
                    <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><div class="text-sm text-slate-400">Transaction ID</div><div class="mt-2 break-all text-sm font-semibold text-white">${escapeHtml(request.transaction_id || '—')}</div></div>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                    ${request.transaction_id ? `<a class="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/15" href="https://easypaisa.com.pk/ticket-check/?ticketNo=${escapeAttr(request.transaction_id)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Verify TXID</span></a>` : ''}
                    ${proofButton}
                </div>
            </article>
        `;
    }).join('');
}

function renderAdminPaymentRequests(paymentRequests, legacyTransactions) {
    const items = [
        ...paymentRequests.map((request) => ({
            ...request,
            entry_kind: 'payment_request',
            source_label: 'Payment Request'
        })),
        ...legacyTransactions.map((transaction) => ({
            ...transaction,
            entry_kind: 'legacy_transaction',
            source_label: 'Legacy Deposit'
        }))
    ];
    if (!items.length) {
        return renderEmptyState('No pending requests', 'New Easypaisa transaction IDs will appear here for verification and approval.');
    }
    const rows = items.map((item) => {
        const proofButton = item.screenshot ? `
            <button class="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10" data-action="view-payment-proof" data-image="${escapeAttr(getUploadUrl(item.screenshot))}" data-user="${escapeAttr(item.user_name || 'Customer')}" data-email="${escapeAttr(item.user_email || 'Unknown email')}" data-amount="${escapeAttr(formatMoneyPrecise(item.amount))}" data-status="${escapeAttr(formatStatus(item.status || 'pending'))}">
                <i class="fa-regular fa-image"></i>
                <span>Proof</span>
            </button>
        ` : '<span class="text-xs text-slate-500">No proof</span>';
        const actionButtons = item.entry_kind === 'payment_request'
            ? `
                <button class="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400" data-action="approve-payment-request" data-request-id="${escapeAttr(item.id)}">
                    <i class="fa-solid fa-check"></i>
                    <span>Approve</span>
                </button>
                <button class="inline-flex items-center gap-1 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400" data-action="reject-payment-request" data-request-id="${escapeAttr(item.id)}">
                    <i class="fa-solid fa-xmark"></i>
                    <span>Reject</span>
                </button>
            `
            : `
                <button class="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400" data-action="approve-transaction" data-tx-id="${escapeAttr(item.id)}">
                    <i class="fa-solid fa-check"></i>
                    <span>Approve</span>
                </button>
                <button class="inline-flex items-center gap-1 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400" data-action="cancel-transaction" data-tx-id="${escapeAttr(item.id)}">
                    <i class="fa-solid fa-xmark"></i>
                    <span>Cancel</span>
                </button>
            `;
        return `
            <tr class="border-b border-slate-800/80 align-top last:border-b-0">
                <td class="px-4 py-3 font-medium text-slate-300">${escapeHtml(item.source_label)}</td>
                <td class="px-4 py-3 font-medium text-white">${escapeHtml(item.user_name || 'Customer')}</td>
                <td class="px-4 py-3 break-all text-slate-300">${escapeHtml(item.user_email || 'Unknown email')}</td>
                <td class="px-4 py-3 whitespace-nowrap font-semibold text-white">${escapeHtml(formatMoneyPrecise(item.amount))}</td>
                <td class="px-4 py-3 break-all text-slate-300">${escapeHtml(item.transaction_id || `#${item.id}`)}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-400">${escapeHtml(formatRelativeTime(item.created_at))}</td>
                <td class="px-4 py-3">${proofButton}</td>
                <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                        ${item.transaction_id ? `<a class="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10" href="https://easypaisa.com.pk/ticket-check/?ticketNo=${escapeAttr(item.transaction_id)}" target="_blank" style="text-decoration:none; background:rgba(56,189,248,.15); border-color:rgba(56,189,248,.3); color:#38bdf8;"><span>Verify TXID</span></a>` : ''}
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    return renderAdminTable(
        ['Source', 'Customer', 'User Email', 'Amount', 'Transaction ID', 'Submitted', 'Proof', 'Actions'],
        rows,
        'min-w-[1240px]'
    );
}

function renderAdminPaymentHistory(paymentRequests) {
    if (!paymentRequests.length) {
        return renderEmptyState('No processed requests', 'Approved and rejected payment requests will appear here once processed by admin.');
    }
    const rows = paymentRequests.map((request) => {
        const proofButton = request.screenshot ? `
            <button class="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10" data-action="view-payment-proof" data-image="${escapeAttr(getUploadUrl(request.screenshot))}" data-user="${escapeAttr(request.user_name || 'Customer')}" data-email="${escapeAttr(request.user_email || 'Unknown email')}" data-amount="${escapeAttr(formatMoneyPrecise(request.amount))}" data-status="${escapeAttr(formatStatus(request.status || 'pending'))}">
                <i class="fa-regular fa-image"></i>
                <span>View Proof</span>
            </button>
        ` : '<span class="text-xs text-slate-500">No proof</span>';
        return `
            <tr class="border-b border-slate-800/80 align-top last:border-b-0">
                <td class="px-4 py-3 font-medium text-white">${escapeHtml(request.user_name || 'Customer')}</td>
                <td class="px-4 py-3 break-all text-slate-300">${escapeHtml(request.user_email || 'Unknown email')}</td>
                <td class="px-4 py-3 whitespace-nowrap font-semibold text-white">${escapeHtml(formatMoneyPrecise(request.amount))}</td>
                <td class="px-4 py-3 break-all text-slate-300">${escapeHtml(request.transaction_id || `#${request.id}`)}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-400">${escapeHtml(formatRelativeTime(request.created_at))}</td>
                <td class="px-4 py-3">${renderStatusBadge(request.status || 'pending')}</td>
                <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                        ${request.transaction_id ? `<a class="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10" href="https://easypaisa.com.pk/ticket-check/?ticketNo=${escapeAttr(request.transaction_id)}" target="_blank" style="text-decoration:none; background:rgba(56,189,248,.15); border-color:rgba(56,189,248,.3); color:#38bdf8;"><span>Verify TXID</span></a>` : ''}
                        ${proofButton}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    return renderAdminTable(
        ['Customer', 'User Email', 'Amount', 'Transaction ID', 'Submitted', 'Status', 'Actions'],
        rows,
        'min-w-[1160px]'
    );
}

function renderFinancialLedger(transactions) {
    if (!transactions.length) {
        return renderEmptyState('No ledger entries', 'Approved deposits and order deductions will appear here for financial tracking.');
    }
    const rows = transactions.map((transaction) => {
        const isDeduction = String(transaction.type || 'deposit').toLowerCase() === 'deduction';
        const amountText = `${isDeduction ? '-' : '+'}${formatMoneyPrecise(transaction.amount)}`;
        const referenceText = transaction.transaction_id || `Ledger #${transaction.id}`;
        const detailsText = transaction.description || (isDeduction ? 'Wallet deduction for OTP order' : 'Wallet deposit approved');
        return `
            <tr class="border-b border-slate-800/80 align-top last:border-b-0">
                <td class="px-4 py-3">${renderTypeBadge(transaction.type || 'deposit')}</td>
                <td class="px-4 py-3 font-medium text-white">${escapeHtml(transaction.user_email || transaction.user_name || 'Customer')}</td>
                <td class="px-4 py-3 whitespace-nowrap font-semibold ${isDeduction ? 'text-rose-300' : 'text-emerald-300'}">${escapeHtml(amountText)}</td>
                <td class="px-4 py-3 break-all text-slate-300">${escapeHtml(referenceText)}</td>
                <td class="px-4 py-3 text-slate-300">${escapeHtml(detailsText)}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-400">${escapeHtml(formatRelativeTime(transaction.created_at))}</td>
                <td class="px-4 py-3">${renderStatusBadge(transaction.status || 'approved')}</td>
                <td class="px-4 py-3">
                    ${transaction.transaction_id ? `<a class="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10" href="https://easypaisa.com.pk/ticket-check/?ticketNo=${escapeAttr(transaction.transaction_id)}" target="_blank" style="text-decoration:none; background:rgba(56,189,248,.15); border-color:rgba(56,189,248,.3); color:#38bdf8;"><span>Verify TXID</span></a>` : '<span class="text-xs text-slate-500">Internal Entry</span>'}
                </td>
            </tr>
        `;
    }).join('');
    return renderAdminTable(
        ['Type', 'Customer', 'Amount', 'Reference', 'Details', 'Date', 'Status', 'Actions'],
        rows,
        'min-w-[1240px]'
    );
}

async function loadPaymentHistory() {
    if (!state.currentUser) {
        syncSidebarPendingPayment([]);
        return [];
    }
    const section = qs('payment-history-section');
    const container = qs('payment-history-list');
    if (!section || !container) return;
    section.classList.remove('hidden');
    try {
        const history = await fetchJSON('/api/my-payment-history');
        renderPaymentHistoryCards(history);
        syncSidebarPendingPayment(history);
        return history;
    } catch {
        container.innerHTML = renderEmptyState('Payment history unavailable', 'Your add-money requests could not be loaded right now.');
        syncSidebarPendingPayment([]);
        return [];
    }
}

async function loadAdminData() {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    try {
        const [orders, paymentRequests, ledgerTransactions, pendingTransactions] = await Promise.all([
            fetchJSON('/api/admin/orders'),
            fetchJSON('/api/admin/payment-requests'),
            fetchJSON('/api/admin/transactions/history'),
            fetchJSON('/api/admin/transactions')
        ]);
        const pendingPaymentRequests = paymentRequests.filter((request) => String(request.status || '').toLowerCase() === 'pending');
        const processedPaymentRequests = paymentRequests.filter((request) => String(request.status || '').toLowerCase() !== 'pending');
        const totalPendingCount = pendingPaymentRequests.length + pendingTransactions.length;
        const totalDeposits = ledgerTransactions
            .filter((transaction) => String(transaction.status || '').toLowerCase() === 'approved' && String(transaction.type || 'deposit').toLowerCase() === 'deposit')
            .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
        const totalApiCost = orders.reduce((sum, order) => sum + (order.profit_pkr != null ? Number(order.provider_cost_pkr || 0) : 0), 0);
        const totalProfit = orders.reduce((sum, order) => sum + (order.profit_pkr != null ? Number(order.profit_pkr || 0) : 0), 0);
        renderAdminStats({ totalDeposits, totalApiCost, totalProfit });
        qs('admin-payment-requests-list').innerHTML = renderAdminPaymentRequests(pendingPaymentRequests, pendingTransactions);
        renderAdminOrders(orders);
        qs('admin-payment-history-list').innerHTML = renderAdminPaymentHistory(processedPaymentRequests);
        qs('admin-financial-ledger-list').innerHTML = renderFinancialLedger(ledgerTransactions);
        if (totalPendingCount > 0) {
            if (totalPendingCount > state.lastPendingCount) {
                startAdminAlertLoop();
                showToast(`New payment request received. Pending approvals: ${totalPendingCount}`, 'success', 30000, {
                    dismissLabel: 'Mute',
                    onDismiss: stopAdminAlertLoop
                });
                browserNotify('MRF SMS Admin Alert', `New payment request received. Pending approvals: ${totalPendingCount}`);
            }
        }
        if (totalPendingCount === 0 || totalPendingCount < state.lastPendingCount) {
            stopAdminAlertLoop();
        }
        state.lastPendingCount = totalPendingCount;
    } catch (err) {
        showToast(err.message || 'Failed to load admin dashboard', 'error');
    }
}

async function refreshUserInfo() {
    if (!state.currentUser) return;
    try {
        const user = await fetchJSON('/api/me');
        state.currentUser = user;
        syncAccountShortcutButtons();
        qs('login-prompt').classList.add('hidden');
        qs('user-info').classList.remove('hidden');
        qs('user-balance').textContent = formatMoney(user.balance);
        qs('account-name').textContent = user.name || '—';
        qs('account-email').textContent = user.email || '—';
        qs('account-password').textContent = user.maskedPassword || '********';
        qs('account-referral').textContent = user.referralCode || '—';
        qs('account-role').textContent = formatStatus(user.role || 'user');
        const orders = await fetchJSON('/api/orders');
        renderActiveOrders(orders);
        await loadPaymentHistory();
        if (!state.paymentHistoryRefreshInterval) {
            state.paymentHistoryRefreshInterval = window.setInterval(() => {
                if (state.currentUser) {
                    loadPaymentHistory();
                }
            }, 30000);
        }
        if (user.role === 'admin') {
            qs('admin-panel').classList.remove('hidden');
            await requestBrowserNotificationPermission();
            await loadAdminData();
            if (!state.adminRefreshInterval) {
                state.adminRefreshInterval = window.setInterval(() => {
                    if (state.currentUser && state.currentUser.role === 'admin') {
                        loadAdminData();
                    }
                }, 10000);
            }
        } else {
            qs('admin-panel').classList.add('hidden');
            if (state.adminRefreshInterval) window.clearInterval(state.adminRefreshInterval);
            state.adminRefreshInterval = null;
            state.lastPendingCount = 0;
            stopAdminAlertLoop();
        }
    } catch (err) {
        showToast(err.message || 'Failed to refresh account info', 'error');
    }
}

async function checkAuth() {
    try {
        const user = await fetchJSON('/api/me');
        state.currentUser = user;
        await refreshUserInfo();
    } catch {
        state.currentUser = null;
        syncAccountShortcutButtons();
        hideAccountDetails();
        closeModal('active-orders-modal');
        closeOrderModal();
        qs('login-prompt').classList.remove('hidden');
        qs('user-info').classList.add('hidden');
        qs('payment-history-section').classList.add('hidden');
        qs('sidebar-payment-pending-card')?.classList.add('hidden');
        qs('admin-panel').classList.add('hidden');
        if (state.adminRefreshInterval) window.clearInterval(state.adminRefreshInterval);
        state.adminRefreshInterval = null;
        if (state.paymentHistoryRefreshInterval) window.clearInterval(state.paymentHistoryRefreshInterval);
        state.paymentHistoryRefreshInterval = null;
        hidePaymentTopAlert();
        stopAdminAlertLoop();
    }
}

function setAuthMode(mode) {
    const loginTab = qs('show-login-tab');
    const registerTab = qs('show-register-tab');
    const loginPanel = qs('login-form-wrap');
    const registerPanel = qs('register-form-wrap');
    const isLogin = mode === 'login';
    loginTab.classList.toggle('active', isLogin);
    registerTab.classList.toggle('active', !isLogin);
    loginPanel.classList.toggle('hidden', !isLogin);
    registerPanel.classList.toggle('hidden', isLogin);
}

async function login(email, password) {
    const button = qs('login-btn');
    setLoading(button, 'Signing in...');
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });
        if (!response.ok) throw new Error(await response.text());
        showToast('Logged in successfully', 'success');
        await checkAuth();
    } catch (err) {
        showToast(err.message || 'Login failed', 'error');
    } finally {
        resetLoading(button);
    }
}

async function register(name, email, password) {
    const button = qs('register-btn');
    setLoading(button, 'Creating account...');
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
            credentials: 'include'
        });
        if (!response.ok) throw new Error(await response.text());
        showToast('Account created successfully. Please login.', 'success');
        qs('register-form').reset();
        setAuthMode('login');
    } catch (err) {
        showToast(err.message || 'Registration failed', 'error');
    } finally {
        resetLoading(button);
    }
}

async function savePassword() {
    const button = qs('save-password-btn');
    const currentPassword = qs('current-password').value;
    const newPassword = qs('new-password').value;
    setLoading(button, 'Saving...');
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
            credentials: 'include'
        });
        if (!response.ok) throw new Error(await response.text());
        qs('password-form').reset();
        closeModal('password-modal');
        showToast('Password updated successfully', 'success');
    } catch (err) {
        showToast(err.message || 'Could not change password', 'error');
    } finally {
        resetLoading(button);
    }
}

async function logout() {
    try {
        const response = await fetch('/api/logout', { credentials: 'include' });
        if (!response.ok) throw new Error('Logout failed');
        state.currentUser = null;
        syncAccountShortcutButtons();
        hideAccountDetails();
        state.activeOrder = null;
        stopOrderIntervals();
        closeModal('active-orders-modal');
        if (state.adminRefreshInterval) window.clearInterval(state.adminRefreshInterval);
        state.adminRefreshInterval = null;
        if (state.paymentHistoryRefreshInterval) window.clearInterval(state.paymentHistoryRefreshInterval);
        state.paymentHistoryRefreshInterval = null;
        state.lastPendingCount = 0;
        stopAdminAlertLoop();
        closeModal('payment-modal');
        hidePaymentTopAlert();
        qs('user-info').classList.add('hidden');
        qs('login-prompt').classList.remove('hidden');
        qs('payment-history-section').classList.add('hidden');
        qs('sidebar-payment-pending-card')?.classList.add('hidden');
        qs('admin-panel').classList.add('hidden');
        showToast('Logged out', 'success');
    } catch (err) {
        showToast(err.message || 'Logout failed', 'error');
    }
}

async function orderCountry(name, id) {
    if (!state.currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    openModal('processing-modal');
    try {
        const response = await fetch('/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryName: name, countryId: Number(id), service: state.currentService }),
            credentials: 'include'
        });
        closeModal('processing-modal');
        if (!response.ok) throw new Error(await response.text());
        const order = await response.json();
        showToast('Number purchased successfully', 'success');
        await refreshUserInfo();
        await openOrderModal(order.id);
    } catch (err) {
        closeModal('processing-modal');
        showToast(err.message || 'Order failed', 'error');
    }
}

async function completeActiveOrder() {
    if (!state.activeOrder) return;
    try {
        const response = await fetch(`/api/orders/${state.activeOrder.id}/complete`, { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error(await response.text());
        showToast('Order completed', 'success');
        closeOrderModal();
        await refreshUserInfo();
    } catch (err) {
        showToast(err.message || 'Could not complete order', 'error');
    }
}

async function replaceActiveOrder() {
    if (!state.activeOrder) return;
    if (!window.confirm('Replace the current number?')) return;
    try {
        const response = await fetch(`/api/orders/${state.activeOrder.id}/replace`, { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error(await response.text());
        showToast('Number replaced successfully', 'success');
        await openOrderModal(state.activeOrder.id);
        await refreshUserInfo();
    } catch (err) {
        showToast(err.message || 'Replace failed', 'error');
    }
}

async function cancelActiveOrder() {
    if (!state.activeOrder) return;
    if (!window.confirm('Cancel this order and refund the amount?')) return;
    try {
        const response = await fetch(`/api/orders/${state.activeOrder.id}/cancel`, { method: 'POST', credentials: 'include' });
        const message = await response.text();
        if (!response.ok) throw new Error(message);
        showToast(message || 'Order cancelled and refunded', 'success');
        closeOrderModal();
        await refreshUserInfo();
    } catch (err) {
        showToast(err.message || 'Cancel failed', 'error');
    }
}

async function handleTransactionAction(txId, action) {
    const actionLabel = action === 'approve' ? 'approve' : 'cancel';
    const confirmMessage = action === 'approve'
        ? 'Approve this transaction and add balance to the user?'
        : 'Cancel this transaction without adding funds?';
    if (!window.confirm(confirmMessage)) return;
    try {
        const response = await fetch(`/api/admin/transactions/${txId}/${actionLabel}`, {
            method: 'POST',
            credentials: 'include'
        });
        if (!response.ok) throw new Error(await response.text());
        showToast(action === 'approve' ? 'Payment approved successfully' : 'Payment cancelled successfully', 'success');
        await loadAdminData();
        if (state.currentUser) {
            await refreshUserInfo();
        }
    } catch (err) {
        showToast(err.message || 'Transaction update failed', 'error');
    }
}

async function handlePaymentRequestAction(requestId, action) {
    const endpointAction = action === 'approve' ? 'approve' : 'reject';
    const confirmMessage = action === 'approve'
        ? 'Approve this payment request and add balance to the user?'
        : 'Reject this payment request without adding funds?';
    if (!window.confirm(confirmMessage)) return;
    try {
        const response = await fetch(`/api/admin/payment-requests/${requestId}/${endpointAction}`, {
            method: 'POST',
            credentials: 'include'
        });
        if (!response.ok) throw new Error(await response.text());
        showToast(action === 'approve' ? 'Payment request approved successfully' : 'Payment request rejected successfully', 'success');
        if (state.currentUser) {
            await refreshUserInfo();
        } else {
            await loadAdminData();
            await loadPaymentHistory();
        }
    } catch (err) {
        showToast(err.message || 'Payment request update failed', 'error');
    }
}

function openScreenshotModal({ image, user, email, amount, status }) {
    qs('screenshot-preview').src = image;
    qs('screenshot-preview').alt = `${user} payment proof`;
    qs('screenshot-user').textContent = user;
    qs('screenshot-email').textContent = email;
    qs('screenshot-amount').textContent = amount;
    qs('screenshot-status').textContent = status;
    openModal('screenshot-modal');
}

function copyText(text) {
    navigator.clipboard.writeText(text)
        .then(() => showToast('Copied successfully', 'success'))
        .catch(() => showToast('Copy failed', 'error'));
}

function openSupport() {
    if (window.Tawk_API) {
        window.Tawk_API.toggle();
        return;
    }
    showToast('Support chat is loading...', 'info');
}

function showStartupMessages() {
    const params = new URLSearchParams(window.location.search);
    const googleError = params.get('google_error');
    if (googleError) {
        showToast(`Google sign-in error: ${googleError.replace(/_/g, ' ')}`, 'error', 6000);
        params.delete('google_error');
        const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, document.title, newUrl);
    }
}

function bindStaticEvents() {
    qs('mobile-menu-btn')?.addEventListener('click', () => updateSidebarVisibility(false));
    qs('sidebar-overlay').addEventListener('click', () => updateSidebarVisibility(true));
    qs('theme-toggle').addEventListener('click', toggleTheme);
    qsa('[data-support-trigger]').forEach((button) => {
        button.addEventListener('click', openSupport);
    });
    qs('show-login-tab').addEventListener('click', () => setAuthMode('login'));
    qs('show-register-tab').addEventListener('click', () => setAuthMode('register'));
    qs('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await login(qs('login-email').value.trim(), qs('login-password').value);
    });
    qs('register-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await register(qs('reg-name').value.trim(), qs('reg-email').value.trim(), qs('reg-password').value);
    });
    qs('google-login-btn').addEventListener('click', () => {
        window.location.href = '/api/auth/google';
    });
    qs('password-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await savePassword();
    });
    qs('close-payment-modal')?.addEventListener('click', () => closeModal('payment-modal'));
    qs('close-payment-top-alert')?.addEventListener('click', hidePaymentTopAlert);
    qs('payment-screenshot-input')?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        qs('payment-screenshot-name').textContent = file ? file.name : 'Payment screenshot upload کریں';
        if (file) clearPaymentFormError();
    });
    qs('addFundsForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = qs('submit-payment-btn');
        clearPaymentFormError();
        const amount = Number(qs('payment-amount-input').value || 0);
        const screenshotFile = qs('payment-screenshot-input')?.files?.[0];
        if (!amount || amount < 100) {
            showPaymentFormError('Minimum amount is 100 PKR');
            return;
        }
        if (!screenshotFile) {
            showPaymentFormError('Screenshot upload is required');
            return;
        }
        setLoading(button, 'Submitting payment...');
        try {
            const formData = new FormData();
            formData.append('amount', String(amount));
            formData.append('screenshot', screenshotFile);
            const response = await fetch('/api/request-payment', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            if (!response.ok) throw new Error(await response.text());
            await response.json();
            closeModal('payment-modal');
            showPaymentTopAlert();
            await loadPaymentHistory();
            if (state.currentUser && state.currentUser.role === 'admin') {
                await loadAdminData();
            }
        } catch (err) {
            showPaymentFormError(err.message || 'Could not submit payment request');
        } finally {
            resetLoading(button);
        }
    });
    qs('country-search').addEventListener('input', renderCountries);
    qsa('[data-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            state.currentFilter = button.dataset.filter;
            qsa('[data-filter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.filter === state.currentFilter));
            renderCountries();
        });
    });
    qsa('[data-admin-tab]').forEach((button) => {
        button.addEventListener('click', () => setAdminTab(button.dataset.adminTab));
    });
    qsa('[data-service]').forEach((button) => {
        button.addEventListener('click', async () => {
            state.currentService = button.dataset.service;
            syncServiceButtons();
            qs('country-search').value = '';
            state.currentFilter = 'all';
            qsa('[data-filter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.filter === 'all'));
            updateSidebarVisibility(true);
            await loadCountries();
        });
    });
    document.addEventListener('click', async (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;
        const { action } = actionTarget.dataset;
        if (action === 'copy-account-number') {
            copyText('03439898333');
            return;
        }
        if (action === 'buy-country') {
            await orderCountry(actionTarget.dataset.countryName, actionTarget.dataset.countryId);
            return;
        }
        if (action === 'open-active-orders-modal') {
            openModal('active-orders-modal');
            return;
        }
        if (action === 'view-order') {
            closeModal('active-orders-modal');
            await openOrderModal(actionTarget.dataset.orderId);
            return;
        }
        if (action === 'copy-number') {
            copyText(actionTarget.dataset.value || '');
            return;
        }
        if (action === 'view-screenshot') {
            openScreenshotModal({
                image: actionTarget.dataset.image,
                user: actionTarget.dataset.user,
                email: actionTarget.dataset.email,
                amount: actionTarget.dataset.amount,
                status: actionTarget.dataset.status
            });
            return;
        }
        if (action === 'view-payment-proof') {
            openScreenshotModal({
                image: actionTarget.dataset.image,
                user: actionTarget.dataset.user,
                email: actionTarget.dataset.email,
                amount: actionTarget.dataset.amount,
                status: actionTarget.dataset.status
            });
            return;
        }
        if (action === 'approve-payment-request') {
            await handlePaymentRequestAction(actionTarget.dataset.requestId, 'approve');
            return;
        }
        if (action === 'reject-payment-request') {
            await handlePaymentRequestAction(actionTarget.dataset.requestId, 'reject');
            return;
        }
        if (action === 'approve-transaction') {
            await handleTransactionAction(actionTarget.dataset.txId, 'approve');
            return;
        }
        if (action === 'cancel-transaction') {
            await handleTransactionAction(actionTarget.dataset.txId, 'cancel');
            return;
        }
        if (action === 'complete-order') {
            await completeActiveOrder();
            return;
        }
        if (action === 'replace-order') {
            await replaceActiveOrder();
            return;
        }
        if (action === 'cancel-order') {
            await cancelActiveOrder();
            return;
        }
        if (action === 'close-order-inline') {
            closeOrderModal();
            return;
        }
        if (action === 'copy-otp') {
            if (state.activeOrder?.otp_code) copyText(state.activeOrder.otp_code);
            return;
        }
        if (action === 'open-account-details') {
            openAccountDetails();
            return;
        }
        if (action === 'hide-account-details') {
            hideAccountDetails();
            return;
        }
        if (action === 'open-password-modal') {
            openModal('password-modal');
            return;
        }
        if (action === 'open-payment-modal') {
            openPaymentModal();
            return;
        }
        if (action === 'logout') {
            await logout();
            return;
        }
        if (action === 'check-otp-now') {
            if (state.activeOrder) await pollOtp(state.activeOrder.id, false);
            return;
        }
        if (action === 'copy-order-number') {
            if (state.activeOrder?.phone_number) copyText(state.activeOrder.phone_number);
            return;
        }
    });
    qsa('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.dataset.closeModal === 'order-modal') {
                closeOrderModal();
                return;
            }
            closeModal(button.dataset.closeModal);
        });
    });
    qsa('.app-modal').forEach((modal) => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal(modal.id);
                if (modal.id === 'order-modal') {
                    closeOrderModal();
                }
            }
        });
    });
    window.addEventListener('beforeunload', () => {
        stopOrderIntervals();
        if (state.adminRefreshInterval) window.clearInterval(state.adminRefreshInterval);
        if (state.paymentHistoryRefreshInterval) window.clearInterval(state.paymentHistoryRefreshInterval);
        stopAdminAlertLoop();
    });
}

async function init() {
    initializeTheme();
    hydrateStaticServiceIcons();
    syncServiceButtons();
    syncAccountShortcutButtons();
    setAdminTab('payment-requests');
    setAuthMode('login');
    bindStaticEvents();
    showStartupMessages();
    await loadCountries();
    await checkAuth();
}

document.addEventListener('DOMContentLoaded', init);
