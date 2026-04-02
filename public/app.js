const state = {
    currentUser: null,
    activeOrder: null,
    allCountries: [],
    currentFilter: 'all',
    currentService: 'whatsapp',
    currentAdminTab: 'pending',
    otpInterval: null,
    timerInterval: null,
    adminRefreshInterval: null,
    adminAlertInterval: null,
    lastPendingCount: 0,
    theme: 'light'
};

const serviceMeta = {
    whatsapp: {
        label: 'WhatsApp',
        shortLabel: 'WA',
        description: 'Select a country below to get a number for OTP verification.',
        iconClass: 'fa-brands fa-whatsapp',
        iconTone: 'text-[#25D366]',
        wrapperTone: 'bg-emerald-500/10 ring-1 ring-emerald-400/20'
    },
    facebook: {
        label: 'Facebook',
        shortLabel: 'FB',
        description: 'Choose a country below to buy a number for OTP verification.',
        iconClass: 'fa-brands fa-facebook',
        iconTone: 'text-[#1877F2]',
        wrapperTone: 'bg-blue-500/10 ring-1 ring-blue-400/20'
    },
    instagram: {
        label: 'Instagram',
        shortLabel: 'IG',
        description: 'Pick a country below to get a number for OTP verification.',
        iconClass: 'fa-brands fa-instagram',
        iconTone: 'service-gradient-instagram',
        wrapperTone: 'bg-pink-500/10 ring-1 ring-pink-400/20'
    },
    snapchat: {
        label: 'Snapchat',
        shortLabel: 'SC',
        description: 'Select a country below to purchase a number for OTP verification.',
        iconClass: 'fa-brands fa-snapchat',
        iconTone: 'text-[#FFFC00] drop-shadow-[0_0_10px_rgba(255,252,0,0.25)]',
        wrapperTone: 'bg-yellow-300/10 ring-1 ring-yellow-300/20'
    },
    google: {
        label: 'Google / Gmail / YouTube',
        shortLabel: 'GO',
        description: 'Select a country below to get a Google-family OTP number.',
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

function showToast(message, type = 'info', duration = 4000) {
    const wrap = qs('toast-wrap');
    if (!wrap) return;
    const toneMap = {
        success: 'border-emerald-400/30 bg-emerald-500 text-white',
        error: 'border-rose-400/30 bg-rose-500 text-white',
        info: 'border-blue-400/30 bg-blue-500 text-white'
    };
    const toast = document.createElement('div');
    toast.className = `toast-card ${toneMap[type] || toneMap.info}`;
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="mt-0.5 text-sm"><i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i></div>
            <div class="text-sm font-medium leading-6">${escapeHtml(message)}</div>
        </div>
    `;
    wrap.appendChild(toast);
    window.setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        window.setTimeout(() => toast.remove(), 220);
    }, duration);
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

function closeModal(id) {
    const modal = qs(id);
    if (!modal) return;
    modal.classList.add('hidden');
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
    qs('header-support-button')?.classList.toggle('hidden', isLoggedIn);
    qs('sidebar-support-button')?.classList.toggle('hidden', isLoggedIn);
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
    const minPrice = state.allCountries.length
        ? Math.min(...state.allCountries.map((country) => Number(country.price || 0)))
        : null;
    qs('hero-title').textContent = `Available ${meta.label} Numbers`;
    qs('hero-service-value').textContent = meta.label;
    qs('hero-description').textContent = meta.description;
    qs('hero-service-icon').innerHTML = renderServiceLogo(state.currentService, 'xl');
    qs('hero-country-count').textContent = String(state.allCountries.length);
    qs('hero-min-price').textContent = minPrice ? formatMoney(minPrice) : 'Setup pending';
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
        <div class="overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/55 shadow-glow">
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
    if (order.otp_code) {
        qs('order-otp').classList.remove('hidden');
        qs('order-waiting').classList.add('hidden');
        qs('otp-value').textContent = order.otp_code;
    } else {
        qs('order-otp').classList.add('hidden');
        qs('order-waiting').classList.remove('hidden');
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
}

async function pollOtp(orderId, silent = false) {
    try {
        const result = await fetchJSON(`/api/orders/${orderId}/otp`);
        if (result.received) {
            const refreshed = await fetchJSON(`/api/orders/${orderId}`);
            state.activeOrder = refreshed;
            updateOrderVisual(refreshed);
            stopOrderIntervals();
            notificationSound.play().catch(() => {});
            showToast('OTP received successfully', 'success');
            await refreshUserInfo();
            return true;
        }
        if (result.expired) {
            const refreshed = await fetchJSON(`/api/orders/${orderId}`);
            state.activeOrder = refreshed;
            updateOrderVisual(refreshed);
            stopOrderIntervals();
            showToast('Order expired', 'error');
            await refreshUserInfo();
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
    }
}

async function openOrderModal(orderId) {
    try {
        const order = await fetchJSON(`/api/orders/${orderId}`);
        state.activeOrder = order;
        updateOrderVisual(order);
        openModal('order-modal');
        stopOrderIntervals();
        state.otpInterval = window.setInterval(async () => {
            if (!state.activeOrder) return;
            await pollOtp(state.activeOrder.id, true);
        }, 5000);
        state.timerInterval = window.setInterval(async () => {
            if (!state.activeOrder) return;
            try {
                const updated = await fetchJSON(`/api/orders/${state.activeOrder.id}`);
                state.activeOrder = updated;
                updateOrderVisual(updated);
                const expired = new Date() >= new Date(updated.expires_at);
                if (updated.otp_code || expired || updated.order_status === 'cancelled' || updated.order_status === 'completed') {
                    if (expired && !updated.otp_code && updated.order_status === 'active') {
                        await fetch(`/api/orders/${updated.id}/expire`, { method: 'POST', credentials: 'include' });
                        const refreshed = await fetchJSON(`/api/orders/${updated.id}`);
                        state.activeOrder = refreshed;
                        updateOrderVisual(refreshed);
                        await refreshUserInfo();
                    }
                    stopOrderIntervals();
                }
            } catch {
            }
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
    state.adminAlertInterval = window.setInterval(() => {
        notificationSound.play().catch(() => {});
    }, 6000);
}

function stopAdminAlertLoop() {
    if (state.adminAlertInterval) window.clearInterval(state.adminAlertInterval);
    state.adminAlertInterval = null;
}

function renderActiveOrders(orders) {
    const container = qs('active-orders-list');
    const activeOrders = orders.filter((order) => order.order_status === 'active' || order.order_status === 'otp_received');
    if (!activeOrders.length) {
        container.innerHTML = renderEmptyState('No active orders', 'Your active numbers will appear here with live OTP tracking and action buttons.');
        return;
    }
    container.innerHTML = activeOrders.map((order) => {
        const meta = getServiceMeta(order.service_type);
        return `
            <article class="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/20">
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

function renderAdminOrders(orders) {
    const container = qs('admin-orders-list');
    if (!orders.length) {
        container.innerHTML = renderEmptyState('No orders yet', 'Recent orders will appear here for quick admin review.');
        return;
    }
    const rows = orders.map((order) => {
        const meta = getServiceMeta(order.service_type);
        const providerCostValue = Number(order.provider_cost_pkr || 0);
        const hasProviderCost = providerCostValue > 0;
        const providerCostText = hasProviderCost ? formatMoneyPrecise(providerCostValue) : 'N/A';
        const profitText = hasProviderCost && order.profit_pkr != null ? formatMoneyPrecise(order.profit_pkr) : 'N/A';
        const balanceText = order.client_balance_left == null ? '—' : formatMoneyPrecise(order.client_balance_left);
        return `
            <tr class="border-b border-slate-800/80 align-top last:border-b-0">
                <td class="px-4 py-3 font-medium text-white break-all">${escapeHtml(order.user_email || '—')}</td>
                <td class="px-4 py-3">
                    <div class="inline-flex items-center gap-2">
                        ${renderServiceLogo(order.service_type, 'sm')}
                        <span class="font-medium text-slate-100">${escapeHtml(meta.label)}</span>
                    </div>
                </td>
                <td class="px-4 py-3 font-medium text-slate-200">${escapeHtml(order.phone_number || 'Pending')}</td>
                <td class="px-4 py-3 font-semibold text-white whitespace-nowrap">${formatMoneyPrecise(order.price)}</td>
                <td class="px-4 py-3 whitespace-nowrap ${hasProviderCost ? 'font-semibold text-slate-200' : 'text-slate-400'}">${escapeHtml(providerCostText)}</td>
                <td class="px-4 py-3 whitespace-nowrap font-semibold text-emerald-300">${escapeHtml(profitTe
