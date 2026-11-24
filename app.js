/**
 * SOVANN EXPENSE LEDGER - APP.JS
 * Supabase Auth, CRUD, Month Filter, Budget, Donut Chart, OCR & CSV Export
 */

// --- 1. រៀបចំ SUPABASE ---
const supabaseUrl = 'https://sltfbvmnlybtdxyaeusd.supabase.co';
const supabaseKey = 'sb_publishable_3F1WJOvHe8x1iwYtcUPxkw_1mHm9MzE';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
} else {
    console.error("មិនអាចស្វែងរក Supabase Library ទេ។");
}

// --- 2. អថេរ និងទិន្នន័យ (State) ---
const STORAGE_KEY_SETTINGS = 'sovann_settings';
const DEFAULT_SETTINGS = { exchangeRate: 4100, soundEnabled: true, hapticEnabled: true, monthlyBudgetUSD: 300 };

let currentUser = null;
let currentTransactions = [];
let scannedResult = { amount: 0, currency: 'KHR' };
let selectedDate = new Date();
let isPrivacyMode = false;
let editingTxId = null;
let searchQuery = '';
let activeFilter = 'all';

let formState = {
    type: 'expense',
    currency: 'KHR',
    rawAmount: '0',
    category: 'ម្ហូប & ភេសជ្ជៈ',
    icon: 'restaurant',
    account: 'កាបូបសាច់ប្រាក់ (Cash)',
    note: ''
};

// --- 3. Toast & Custom Confirm Modal ---
let toastTimer = null;
function showToast(msg, type = 'info') {
    const box = document.getElementById('toastBox');
    const icon = document.getElementById('toastIcon');
    const text = document.getElementById('toastMsg');
    if (!box) return alert(msg);

    text.innerText = msg;
    if (type === 'success') {
        icon.innerText = 'check_circle';
        icon.className = 'material-symbols-outlined text-base text-emerald-400';
    } else if (type === 'error') {
        icon.innerText = 'error';
        icon.className = 'material-symbols-outlined text-base text-rose-400';
    } else {
        icon.innerText = 'info';
        icon.className = 'material-symbols-outlined text-base text-brand-gold';
    }

    box.classList.remove('hidden');
    box.classList.add('toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        box.classList.add('hidden');
        box.classList.remove('toast-show');
    }, 2800);
}

let confirmCallback = null;
function openConfirmModal(msg, onYes) {
    document.getElementById('confirmModalMsg').innerText = msg;
    confirmCallback = onYes;
    document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    confirmCallback = null;
}
document.getElementById('confirmModalYesBtn').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
});

// --- 4. មុខងារគ្រប់គ្រងគណនី (AUTHENTICATION) ---
async function checkUserSession() {
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        currentUser = session.user;
        updateUserProfileUI(); // 👈 បន្ថែមបន្ទាត់នេះទី ១
        switchTab('dashboard');
    } else {
        currentUser = null;
        switchTab('auth');
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            updateUserProfileUI(); // 👈 បន្ថែមបន្ទាត់នេះទី ២
            switchTab('dashboard');
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentTransactions = [];
            switchTab('auth');
        }
    });
}
async function handleLogin() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showToast("សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់!", "error");

    const btn = document.getElementById('btnLogin');
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">sync</span> កំពុងចូលគណនី...';

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.innerHTML = oldText;

    if (error) showToast("ការចូលគណនីបរាជ័យ៖ " + error.message, "error");
}

async function handleSignUp() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showToast("សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់!", "error");

    const btn = document.getElementById('btnSignUp');
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">sync</span> កំពុងបង្កើតគណនី...';

    const { error } = await supabaseClient.auth.signUp({ email, password });
    btn.disabled = false;
    btn.innerHTML = oldText;

    if (error) showToast("ការបង្កើតគណនីបរាជ័យ៖ " + error.message, "error");
    else showToast("បង្កើតគណនីជោគជ័យ! សូមចុច Login។", "success");
}

function handleLogout() {
    openConfirmModal('តើអ្នកពិតជាចង់ចាកចេញពីគណនីមែនទេ?', async () => {
        await supabaseClient.auth.signOut();
    });
}

// --- 5. Categories & Helpers ---
const CATEGORIES = {
    expense: [
        { name: 'ម្ហូប & ភេសជ្ជៈ', label: 'ម្ហូប & ភេសជ្ជៈ', icon: 'restaurant' },
        { name: 'ធ្វើដំណើរ / សាំង', label: 'ធ្វើដំណើរ', icon: 'directions_car' },
        { name: 'ទឹកភ្លើង & Wi-Fi', label: 'ទឹកភ្លើង', icon: 'bolt' },
        { name: 'ទិញទំនិញ (Shopping)', label: 'ទិញទំនិញ', icon: 'shopping_bag' },
        { name: 'សុខភាព / ថ្នាំ', label: 'សុខភាព', icon: 'medical_services' },
        { name: 'ផ្សេងៗ (Other)', label: 'ផ្សេងៗ', icon: 'more_horiz' }
    ],
    income: [
        { name: 'ប្រាក់បៀវត្សរ៍ (Salary)', label: 'បៀវត្សរ៍', icon: 'payments' },
        { name: 'ប្រាក់រង្វាន់ / Bonus', label: 'ប្រាក់រង្វាន់', icon: 'redeem' },
        { name: 'លក់ដូរ / អាជីវកម្ម', label: 'លក់ដូរ', icon: 'storefront' },
        { name: 'ផ្សេងៗ (Other)', label: 'ផ្សេងៗ', icon: 'more_horiz' }
    ]
};

const STORAGE_KEY_CATS = 'sovann_custom_cats';
let selectedNewCatIcon = 'local_cafe';

function getCustomCategories() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CATS)) || { expense: [], income: [] }; }
    catch (e) { return { expense: [], income: [] }; }
}

function getAllCategories(type) {
    const custom = getCustomCategories();
    return [...(CATEGORIES[type] || []), ...(custom[type] || [])];
}

function getIconForCategory(category) {
    const all = [...getAllCategories('expense'), ...getAllCategories('income')];
    const found = all.find(c => c.name === category);
    if (found) return found.icon;
    if (category === 'ផ្ទេរប្រាក់ (Transfer)') return 'swap_horiz';
    return 'receipt_long';
}

function renderCategoryPicker(type) {
    const picker = document.getElementById('categoryPicker');
    const items = getAllCategories(type);
    formState.category = items[0].name;
    formState.icon = items[0].icon;

    picker.innerHTML = items.map((cat, idx) => `
        <button class="cat-pill p-2.5 rounded-xl bg-cardBg ${idx === 0 ? 'border-2 border-brand-gold text-brand-gold' : 'border border-borderDim text-slate-300'} flex flex-col items-center gap-1 active:scale-95 transition"
            data-icon="${cat.icon}" data-name="${escapeHTML(cat.name)}" type="button" onclick="selectCategory(this)">
            <span class="material-symbols-outlined text-xl">${cat.icon}</span>
            <span class="text-[11px] font-semibold truncate w-full text-center">${escapeHTML(cat.label)}</span>
        </button>
    `).join('') + `
        <button type="button" onclick="openAddCatModal()" class="p-2.5 rounded-xl bg-darkBg border border-dashed border-brand-gold/50 text-brand-gold flex flex-col items-center justify-center gap-1 active:scale-95 transition">
            <span class="material-symbols-outlined text-xl">add</span>
            <span class="text-[11px] font-semibold">បន្ថែម</span>
        </button>
    `;
}

function openAddCatModal() {
    document.getElementById('newCatNameInput').value = '';
    document.getElementById('addCatModal').classList.remove('hidden');
}
function closeAddCatModal() { document.getElementById('addCatModal').classList.add('hidden'); }
function pickNewCatIcon(icon, btn) {
    selectedNewCatIcon = icon;
    document.querySelectorAll('.cat-ico-btn').forEach(b => {
        b.className = 'cat-ico-btn p-2 rounded-xl bg-darkBg border border-borderDim text-slate-400 flex justify-center';
    });
    btn.className = 'cat-ico-btn p-2 rounded-xl bg-darkBg border-2 border-brand-gold text-brand-gold flex justify-center';
}
function saveCustomCategory() {
    const name = document.getElementById('newCatNameInput').value.trim();
    if (!name) return showToast('សូមបញ្ចូលឈ្មោះប្រភេទ!', 'error');
    const type = formState.type === 'income' ? 'income' : 'expense';
    const custom = getCustomCategories();
    custom[type].push({ name, label: name, icon: selectedNewCatIcon });
    localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(custom));
    closeAddCatModal();
    renderCategoryPicker(type);
    const pills = document.querySelectorAll('.cat-pill');
    if (pills.length) selectCategory(pills[pills.length - 1]);
    showToast('បានបន្ថែមប្រភេទថ្មីជោគជ័យ!', 'success');
}

function selectCategory(pill) {
    document.querySelectorAll('.cat-pill').forEach(p => {
        p.className = 'cat-pill p-2.5 rounded-xl bg-cardBg border border-borderDim text-slate-300 flex flex-col items-center gap-1 active:scale-95 transition';
    });
    pill.className = 'cat-pill p-2.5 rounded-xl bg-cardBg border-2 border-brand-gold text-brand-gold flex flex-col items-center gap-1 active:scale-95 transition';
    formState.category = pill.getAttribute('data-name');
    formState.icon = pill.getAttribute('data-icon');
}

function initDataStore() {
    if (!localStorage.getItem(STORAGE_KEY_SETTINGS)) {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    }
}

function getSettings() {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS)) }; }
    catch (e) { return DEFAULT_SETTINGS; }
}

function playRoyalFeedback(type = 'success') {
    const settings = getSettings();
    if (settings.hapticEnabled && 'vibrate' in navigator) {
        try { navigator.vibrate([40, 30, 80]); } catch (e) { }
    }
    if (settings.soundEnabled) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const now = ctx.currentTime;
            let notes = type === 'success' ? [523.25, 659.25, 783.99] : [392.00, 329.63, 261.63];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                gain.gain.setValueAtTime(0.12, now + idx * 0.07);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.07);
                osc.stop(now + idx * 0.07 + 0.35);
            });
        } catch (e) { }
    }
}
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// --- 6. Navigation & Filters ---
function switchTab(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }

    ['dashboard', 'analytics', 'camera', 'settings'].forEach(item => {
        const btn = document.getElementById('nav-' + item);
        if (btn) {
            btn.className = (item === pageId)
                ? 'flex flex-col items-center text-brand-gold gap-0.5'
                : 'flex flex-col items-center text-slate-400 hover:text-slate-200 gap-0.5';
        }
    });

    const dock = document.getElementById('bottomDock');
    dock.style.display = (pageId === 'camera' || pageId === 'add' || pageId === 'auth') ? 'none' : 'flex';

    if (pageId === 'dashboard') loadAndRenderDashboard();
    if (pageId === 'analytics') renderAnalytics();
    if (pageId === 'settings') renderSettings();
}

function changeMonth(delta) {
    selectedDate.setMonth(selectedDate.getMonth() + delta);
    renderDashboardUI();
    renderAnalytics();
}

function getMonthlyTransactions() {
    const targetMonth = selectedDate.getMonth();
    const targetYear = selectedDate.getFullYear();
    return currentTransactions.filter(tx => {
        const d = new Date(tx.created_at || Date.now());
        return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });
}

function togglePrivacyMode() {
    isPrivacyMode = !isPrivacyMode;
    document.getElementById('privacyIcon').innerText = isPrivacyMode ? 'visibility_off' : 'visibility';
    document.getElementById('privacyText').innerText = isPrivacyMode ? 'លាក់' : 'បង្ហាញ';
    renderDashboardUI();
}
function handleSearch(val) {
    searchQuery = val.trim().toLowerCase();
    renderDashboardUI();
}

function setTxFilter(filterType, btnEl) {
    activeFilter = filterType;
    document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.className = 'filter-pill px-3 py-1 rounded-full text-[11px] font-semibold bg-cardBg border border-borderDim text-slate-400 whitespace-nowrap transition';
    });
    if (btnEl) {
        btnEl.className = 'filter-pill px-3 py-1 rounded-full text-[11px] font-bold bg-brand-gold text-black whitespace-nowrap transition';
    }
    renderDashboardUI();
}
function openAddForm(type = 'expense') {
    editingTxId = null;
    const delBtn = document.getElementById('btnDeleteTx');
    if (delBtn) delBtn.classList.add('hidden');

    setTxType(type);
    formState.rawAmount = '0';
    document.getElementById('txNoteInput').value = '';
    document.getElementById('txDateInput').value = new Date().toISOString().split('T')[0];
    updateFormAmountDisplay();
    switchTab('add');
}

function editTransaction(id) {
    const tx = currentTransactions.find(t => String(t._id) === String(id));
    if (!tx) return;

    editingTxId = tx._id;
    const delBtn = document.getElementById('btnDeleteTx');
    if (delBtn) delBtn.classList.remove('hidden');

    setTxType(tx.type);
    setCurrency(tx.currency);
    formState.rawAmount = String(tx.amount);
    formState.category = tx.category;
    document.getElementById('txNoteInput').value = tx.note || '';
    document.getElementById('txDateInput').value = tx.created_at ? new Date(tx.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    document.querySelectorAll('input[name="accountChoice"]').forEach(r => {
        if (r.value === tx.account) r.checked = true;
    });
    document.querySelectorAll('input[name="transferDir"]').forEach(r => {
        if (r.value === tx.account) r.checked = true;
    });
    document.querySelectorAll('.cat-pill').forEach(p => {
        if (p.getAttribute('data-name') === tx.category) selectCategory(p);
    });

    document.getElementById('formHeaderTitle').innerText = 'កែសម្រួលប្រតិបត្តិការ (Edit)';
    updateFormAmountDisplay();
    switchTab('add');
}

function deleteCurrentEditingTx() {
    if (!editingTxId) return;
    openConfirmModal('តើអ្នកពិតជាចង់លុបប្រតិបត្តិការនេះមែនទេ?', async () => {
        if (!supabaseClient) return;
        const { error } = await supabaseClient.from('transactions').delete().eq('_id', editingTxId);
        if (error) return showToast("មានបញ្ហាក្នុងការលុបទិន្នន័យ", "error");
        playRoyalFeedback('delete');
        showToast("បានលុបប្រតិបត្តិការរួចរាល់", "success");
        editingTxId = null;
        switchTab('dashboard');
    });
}

function setTxType(type) {
    formState.type = type;
    const btnExp = document.getElementById('tabExpense');
    const btnInc = document.getElementById('tabIncome');
    const btnTrf = document.getElementById('tabTransfer');
    const sign = document.getElementById('amountSign');
    const headerTitle = document.getElementById('formHeaderTitle');
    const catSec = document.getElementById('categorySection');
    const accSec = document.getElementById('accountSection');
    const trfSec = document.getElementById('transferSection');

    const inactiveClass = 'py-2 rounded-lg text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 transition';
    btnExp.className = inactiveClass;
    btnInc.className = inactiveClass;
    if (btnTrf) btnTrf.className = inactiveClass;

    if (type === 'expense') {
        btnExp.className = 'py-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center gap-1 transition';
        sign.className = 'text-rose-400';
        sign.innerText = '-';
        headerTitle.innerText = editingTxId ? 'កែសម្រួលប្រតិបត្តិការ (Edit)' : 'កត់ត្រាចំណាយ';
        if (catSec) catSec.classList.remove('hidden');
        if (accSec) accSec.classList.remove('hidden');
        if (trfSec) trfSec.classList.add('hidden');
        renderCategoryPicker(type);
    } else if (type === 'income') {
        btnInc.className = 'py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1 transition';
        sign.className = 'text-emerald-400';
        sign.innerText = '+';
        headerTitle.innerText = editingTxId ? 'កែសម្រួលប្រតិបត្តិការ (Edit)' : 'កត់ត្រាចំណូល';
        if (catSec) catSec.classList.remove('hidden');
        if (accSec) accSec.classList.remove('hidden');
        if (trfSec) trfSec.classList.add('hidden');
        renderCategoryPicker(type);
    } else if (type === 'transfer') {
        if (btnTrf) btnTrf.className = 'py-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center gap-1 transition';
        sign.className = 'text-sky-400';
        sign.innerText = '⇄';
        headerTitle.innerText = editingTxId ? 'កែសម្រួលការផ្ទេរប្រាក់' : 'ផ្ទេរប្រាក់រវាងគណនី';
        if (catSec) catSec.classList.add('hidden');
        if (accSec) accSec.classList.add('hidden');
        if (trfSec) trfSec.classList.remove('hidden');
        formState.category = 'ផ្ទេរប្រាក់ (Transfer)';
    }
}

function setCurrency(curr) {
    formState.currency = curr;
    const khrBtn = document.getElementById('formCurrKHR');
    const usdBtn = document.getElementById('formCurrUSD');
    const specialBtn = document.getElementById('npSpecialBtn');

    if (curr === 'KHR') {
        khrBtn.className = 'px-3 py-1 rounded bg-brand-gold text-black transition';
        usdBtn.className = 'px-3 py-1 rounded text-slate-400 hover:text-white transition';
        if (specialBtn) { specialBtn.innerText = '000'; specialBtn.setAttribute('data-v', '000'); }
        formState.rawAmount = formState.rawAmount.split('.')[0] || '0';
    } else {
        usdBtn.className = 'px-3 py-1 rounded bg-brand-gold text-black transition';
        khrBtn.className = 'px-3 py-1 rounded text-slate-400 hover:text-white transition';
        if (specialBtn) { specialBtn.innerText = '.'; specialBtn.setAttribute('data-v', '.'); }
    }
    updateFormAmountDisplay();
}

function updateFormAmountDisplay() {
    const raw = formState.rawAmount || '0';
    const num = Number(raw) || 0;
    const rate = Number(getSettings().exchangeRate) || 4100;
    const disp = document.getElementById('amountDisplay');
    const unit = document.getElementById('amountUnit');
    const sub = document.getElementById('convertedSub');
    const rateLabel = document.getElementById('formRateLabel');

    rateLabel.innerText = `1$ = ${rate.toLocaleString()} ៛`;
    if (raw.includes('.')) {
        const [intPart, decPart] = raw.split('.');
        disp.value = `${Number(intPart || 0).toLocaleString()}.${decPart}`;
    } else {
        disp.value = num.toLocaleString();
    }

    if (formState.currency === 'KHR') {
        unit.innerText = '៛';
        sub.innerText = `≈ $${(num / rate).toFixed(2)} USD`;
    } else {
        unit.innerText = '$';
        sub.innerText = `≈ ${Math.round(num * rate).toLocaleString()} ៛`;
    }
}

document.querySelectorAll('.np-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-v');
        if (v === '.') {
            if (!formState.rawAmount.includes('.')) formState.rawAmount += '.';
        } else if (formState.rawAmount === '0') {
            formState.rawAmount = v === '000' ? '0' : v;
        } else {
            if (formState.rawAmount.includes('.') && formState.rawAmount.split('.')[1].length >= 2) return;
            formState.rawAmount += v;
        }
        updateFormAmountDisplay();
    });
});

document.getElementById('npBack').addEventListener('click', () => {
    formState.rawAmount = formState.rawAmount.slice(0, -1);
    if (formState.rawAmount === '') formState.rawAmount = '0';
    updateFormAmountDisplay();
});

// --- 8. OCR Scanner (Tesseract.js) ---
async function processReceiptOCR(event) {
    const file = event.target.files[0];
    if (!file) return;

    const previewImage = document.getElementById('previewImage');
    const noImageText = document.getElementById('noImageText');
    const ocrResultCard = document.getElementById('ocrResultCard');
    previewImage.src = URL.createObjectURL(file);
    previewImage.classList.remove('hidden');
    noImageText.classList.add('hidden');
    ocrResultCard.classList.add('hidden');

    const statusText = document.getElementById('cameraStatusText');
    const icon = document.getElementById('cameraIcon');
    const laser = document.getElementById('laserScanner');
    const shutterBtn = document.getElementById('shutterBtn');

    shutterBtn.disabled = true;
    laser.classList.remove('hidden');
    statusText.innerText = "កំពុងរៀបចំ AI...";
    statusText.classList.replace('text-slate-400', 'text-brand-gold');
    icon.innerText = "sync";
    icon.classList.add("animate-spin");

    try {
        if (typeof Tesseract === 'undefined') return showToast("Tesseract Library មិនទាន់ដំណើរការទេ។", "error");
        const result = await Tesseract.recognize(file, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') statusText.innerText = `កំពុងវិភាគ... ${Math.round(m.progress * 100)}%`;
            }
        });

        const text = result.data.text;
        let highestAmount = 0;

        // ១. ស្វែងរកតួលេខដែលនៅជាប់ពាក្យ Total, Amount, Sum, Pay ឬសញ្ញា $
        const totalRegex = /(?:total|amount|sum|pay|usd|\$)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi;
        let match;
        while ((match = totalRegex.exec(text)) !== null) {
            const val = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(val) && val > highestAmount && val < 100000000) {
                highestAmount = val;
            }
        }

        // ២. បើរកពាក្យគន្លឹះមិនឃើញ ទើបរកតួលេខធំជាងគេ ដោយកាត់ចោលលេខទូរស័ព្ទ (ចាប់ផ្តើមដោយ 0)
        if (highestAmount === 0) {
            const numberMatches = text.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b|\b\d+(?:\.\d{1,2})?\b/g);
            if (numberMatches) {
                numberMatches.forEach(numStr => {
                    const clean = numStr.replace(/,/g, '');
                    if (clean.startsWith('0') && !clean.includes('.')) return; // រំលងលេខទូរស័ព្ទ
                    const val = parseFloat(clean);
                    if (val > highestAmount && val < 50000000) highestAmount = val;
                });
            }
        }

        if (highestAmount > 0) {
            scannedResult.currency = highestAmount > 1000 ? 'KHR' : 'USD';
            scannedResult.amount = highestAmount;
            document.getElementById('ocrAmount').innerText = highestAmount.toLocaleString();
            document.getElementById('ocrCurrency').innerText = scannedResult.currency === 'KHR' ? '៛' : '$';
            ocrResultCard.classList.remove('hidden');
            statusText.innerText = "ស្កេនជោគជ័យ!";
            playRoyalFeedback('success');
        } else {
            showToast("AI មិនអាចរកឃើញតួលេខទឹកប្រាក់ក្នុងរូបនេះទេ", "error");
            statusText.innerText = "ស្កេនបរាជ័យ";
        }
    } catch (err) {
        showToast("មានបញ្ហាក្នុងការស្កេនរូបភាព", "error");
        statusText.innerText = "មានបញ្ហា";
    } finally {
        icon.innerText = "photo_camera";
        icon.classList.remove("animate-spin");
        laser.classList.add('hidden');
        statusText.classList.replace('text-brand-gold', 'text-slate-400');
        shutterBtn.disabled = false;
        event.target.value = '';
    }
}

function applyScannedData() {
    editingTxId = null;
    setTxType('expense');
    setCurrency(scannedResult.currency);
    formState.rawAmount = scannedResult.amount.toString();
    document.getElementById('txNoteInput').value = 'វិក្កយបត្រ (បានស្កេន)';
    document.getElementById('txDateInput').value = new Date().toISOString().split('T')[0];
    updateFormAmountDisplay();
    switchTab('add');
}

// --- 9. SUPABASE CRUD ---
document.getElementById('txForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveCurrentFormTransaction();
});

async function saveCurrentFormTransaction() {
    if (!supabaseClient || !currentUser) return showToast("សូម Login ជាមុនសិន!", "error");

    const rate = Number(getSettings().exchangeRate) || 4100;
    const num = Number(formState.rawAmount || 0);
    if (num <= 0) return showToast("សូមបញ្ចូលចំនួនទឹកប្រាក់!", "error");

    let accountVal = '';
    let categoryVal = formState.category;
    if (formState.type === 'transfer') {
        accountVal = document.querySelector('input[name="transferDir"]:checked').value;
        categoryVal = 'ផ្ទេរប្រាក់ (Transfer)';
    } else {
        accountVal = document.querySelector('input[name="accountChoice"]:checked').value;
    }
    const noteVal = document.getElementById('txNoteInput').value;
    const dateVal = document.getElementById('txDateInput').value;
    const txDateISO = dateVal ? new Date(dateVal + 'T12:00:00').toISOString() : new Date().toISOString();

    const txPayload = {
        user_id: currentUser.id,
        type: formState.type,
        amount: num,
        currency: formState.currency,
        category: formState.category,
        note: noteVal,
        account: accountVal,
        created_at: txDateISO
    };

    try {
        const submitBtn = document.querySelector('#txForm button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> កំពុងរក្សាទុក...';
        submitBtn.disabled = true;

        let error;
        if (editingTxId) {
            ({ error } = await supabaseClient.from('transactions').update(txPayload).eq('_id', editingTxId));
        } else {
            txPayload._id = Date.now();
            ({ error } = await supabaseClient.from('transactions').insert([txPayload]));
        }

        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;

        if (error) return showToast("បរាជ័យ៖ " + error.message, "error");

        playRoyalFeedback('success');
        if (editingTxId) {
            showToast("កែសម្រួលជោគជ័យ!", "success");
            editingTxId = null;
            switchTab('dashboard');
            return;
        }

        let khr = formState.currency === 'KHR' ? num : Math.round(num * rate);
        let usd = formState.currency === 'KHR' ? Number((num / rate).toFixed(2)) : num;
        const prefix = formState.type === 'expense' ? '-' : '+';

        document.getElementById('modalDispAmount').innerText = `${prefix} ${khr.toLocaleString()} ៛ (≈ $${usd.toFixed(2)})`;
        document.getElementById('modalDispCat').innerText = formState.category;
        document.getElementById('modalDispAcc').innerText = accountVal;
        document.getElementById('successModal').classList.remove('hidden');
    } catch (err) {
        showToast("មានកំហុសប្រព័ន្ធ!", "error");
    }
}

async function loadAndRenderDashboard() {
    if (!supabaseClient || !currentUser) return;
    const cacheKey = `sovann_tx_cache_${currentUser.id}`;

    // បង្ហាញទិន្នន័យពី Cache ភ្លាមៗ (ជួយឲ្យលឿន និងមើលបានពេល Offline)
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            currentTransactions = JSON.parse(cached);
            renderDashboardUI();
        } catch (e) { }
    } else {
        document.getElementById('txListDashboard').innerHTML = `
            <div class="flex justify-center p-6">
                <span class="material-symbols-outlined animate-spin text-brand-gold text-3xl">sync</span>
            </div>`;
    }

    if (!navigator.onLine) return;

    try {
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        currentTransactions = data || [];
        localStorage.setItem(cacheKey, JSON.stringify(currentTransactions));
        renderDashboardUI();
    } catch (error) {
        if (currentTransactions.length > 0) {
            showToast('កំពុងបង្ហាញទិន្នន័យ Offline Cache', 'info');
        } else {
            document.getElementById('txListDashboard').innerHTML = `<div class="p-6 text-center text-xs text-rose-500 bg-cardBg rounded-2xl border border-borderDim">មានបញ្ហាក្នុងការទាញទិន្នន័យ</div>`;
        }
    }
}

function deleteTransaction(id, event) {
    if (event) event.stopPropagation();
    openConfirmModal('តើអ្នកពិតជាចង់លុបប្រតិបត្តិការនេះមែនទេ?', async () => {
        if (!supabaseClient) return;
        const { error } = await supabaseClient.from('transactions').delete().eq('_id', id);
        if (error) return showToast("មានបញ្ហាក្នុងការលុបទិន្នន័យ", "error");
        playRoyalFeedback('delete');
        showToast("បានលុបប្រតិបត្តិការរួចរាល់", "success");
        loadAndRenderDashboard();
    });
}

function renderDashboardUI() {
    const hour = new Date().getHours();
    const greetingEl = document.getElementById('greetingText');
    if (greetingEl) {
        if (hour < 12) greetingEl.innerText = 'អរុណសួស្តី,';
        else if (hour < 18) greetingEl.innerText = 'ទិវាសួស្តី,';
        else greetingEl.innerText = 'សាយ័ណ្ហសួស្តី,';
    }

    const settings = getSettings();
    const rate = Number(settings.exchangeRate) || 4100;
    const budgetUSD = Number(settings.monthlyBudgetUSD) || 300;
    const list = getMonthlyTransactions();
    // គណនាសមតុល្យសរុបតាមកាបូប (Cash vs ACLEDA)
    let cashBalKHR = 0, acledaBalKHR = 0;
    currentTransactions.forEach(item => {
        let khr = item.currency === 'KHR' ? item.amount : (item.amount * rate);
        if (item.type === 'transfer') {
            if (item.account === 'ACLEDA ➔ Cash') {
                acledaBalKHR -= khr;
                cashBalKHR += khr;
            } else if (item.account === 'Cash ➔ ACLEDA') {
                cashBalKHR -= khr;
                acledaBalKHR += khr;
            }
        } else {
            const isCash = item.account && item.account.includes('Cash');
            const delta = item.type === 'income' ? khr : -khr;
            if (isCash) cashBalKHR += delta;
            else acledaBalKHR += delta;
        }
    });
    const elCash = document.getElementById('walletCashKHR');
    const elAcleda = document.getElementById('walletAcledaKHR');
    if (elCash) elCash.innerText = isPrivacyMode ? '•••• ៛' : `${Math.round(cashBalKHR).toLocaleString()} ៛`;
    if (elAcleda) elAcleda.innerText = isPrivacyMode ? '•••• ៛' : `${Math.round(acledaBalKHR).toLocaleString()} ៛`;

    const monthLabel = selectedDate.toLocaleDateString('km-KH', { month: 'long', year: 'numeric' });
    document.getElementById('currentMonthLabel').innerText = monthLabel;
    document.getElementById('dispNBCRate').innerText = `1$ = ${rate.toLocaleString()} ៛`;
    document.getElementById('calcRateLabel').innerText = `1$ = ${rate.toLocaleString()}៛`;

    let totalIncKHR = 0, totalIncUSD = 0, totalExpKHR = 0, totalExpUSD = 0;
    list.forEach(item => {
        if (item.type === 'transfer') return; // មិនរាប់ចូលចំណូល ឬចំណាយទេ
        let khr = item.currency === 'KHR' ? item.amount : (item.amount * rate);
        let usd = item.currency === 'USD' ? item.amount : (item.amount / rate);
        if (item.type === 'income') { totalIncKHR += khr; totalIncUSD += usd; }
        else { totalExpKHR += khr; totalExpUSD += usd; }
    });

    const netKHR = totalIncKHR - totalExpKHR;
    const netUSD = totalIncUSD - totalExpUSD;

    document.getElementById('heroKHR').innerHTML = isPrivacyMode ? `•••••• <span class="text-brand-gold text-2xl font-bold">៛</span>` : `${netKHR.toLocaleString()} <span class="text-brand-gold text-2xl font-bold">៛</span>`;
    document.getElementById('heroUSD').innerText = isPrivacyMode ? `≈ $•••• USD` : `≈ $${netUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    document.getElementById('monthIncUSD').innerText = isPrivacyMode ? `+$••••` : `+$${totalIncUSD.toFixed(2)}`;
    document.getElementById('monthIncKHR').innerText = isPrivacyMode ? `•••• ៛` : `${totalIncKHR.toLocaleString()} ៛`;
    document.getElementById('monthExpUSD').innerText = isPrivacyMode ? `-$••••` : `-$${totalExpUSD.toFixed(2)}`;
    document.getElementById('monthExpKHR').innerText = isPrivacyMode ? `•••• ៛` : `${totalExpKHR.toLocaleString()} ៛`;

    // Budget Progress
    const pct = Math.min(Math.round((totalExpUSD / budgetUSD) * 100), 100);
    const bar = document.getElementById('budgetProgressBar');
    const statusTxt = document.getElementById('budgetStatusText');
    bar.style.width = `${pct}%`;
    statusTxt.innerText = `${Math.round((totalExpUSD / budgetUSD) * 100)}%`;

    if (totalExpUSD > budgetUSD) {
        bar.className = 'h-full bg-rose-500 rounded-full transition-all duration-300';
        statusTxt.className = 'text-[11px] font-bold text-rose-400';
    } else if (pct >= 80) {
        bar.className = 'h-full bg-amber-400 rounded-full transition-all duration-300';
        statusTxt.className = 'text-[11px] font-bold text-amber-400';
    } else {
        bar.className = 'h-full bg-emerald-400 rounded-full transition-all duration-300';
        statusTxt.className = 'text-[11px] font-bold text-emerald-400';
    }
    document.getElementById('budgetSpentLabel').innerText = isPrivacyMode ? 'បានចាយ៖ $••••' : `បានចាយ៖ $${totalExpUSD.toFixed(2)}`;
    document.getElementById('budgetLimitLabel').innerText = `កំណត់៖ $${budgetUSD.toFixed(2)}`;

    // អនុវត្ត Search & Filter
    const filteredList = list.filter(item => {
        if (activeFilter === 'expense' && item.type !== 'expense') return false;
        if (activeFilter === 'income' && item.type !== 'income') return false;
        if (activeFilter === 'cash' && (!item.account || !item.account.includes('Cash'))) return false;
        if (activeFilter === 'acleda' && (item.account && item.account.includes('Cash') && item.type !== 'transfer')) return false;
        if (searchQuery) {
            const textToSearch = `${item.note || ''} ${item.category || ''} ${item.account || ''}`.toLowerCase();
            if (!textToSearch.includes(searchQuery)) return false;
        }
        return true;
    });

    document.getElementById('txCountBadge').innerText = `${filteredList.length} ប្រតិបត្តិការ`;

    // Group by Date
    const container = document.getElementById('txListDashboard');
    if (filteredList.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 bg-cardBg rounded-2xl border border-borderDim">មិនមានប្រតិបត្តិការដែលត្រូវនឹងការស្វែងរកទេ</div>`;
        return;
    }

    const todayStr = new Date().toDateString();
    const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
    const groups = {};

    filteredList.forEach(item => {
        const d = new Date(item.created_at || Date.now());
        let label = d.toLocaleDateString('km-KH', { day: '2-digit', month: 'short', year: 'numeric' });
        if (d.toDateString() === todayStr) label = 'ថ្ងៃនេះ (Today)';
        else if (d.toDateString() === yesterdayStr) label = 'ម្សិលមិញ (Yesterday)';
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
    });

    container.innerHTML = Object.keys(groups).map(dateLabel => `
        <div class="space-y-2 pt-1">
            <p class="text-[10px] font-bold text-slate-400 px-1">${dateLabel}</p>
            ${groups[dateLabel].map(item => {
                const isExp = item.type === 'expense';
                const isTrf = item.type === 'transfer';
                const color = isTrf ? 'text-sky-400' : (isExp ? 'text-rose-400' : 'text-emerald-400');
                const sign = isTrf ? '⇄' : (isExp ? '-' : '+');
                const iconBg = isTrf ? 'bg-sky-500/10 text-sky-400' : (isExp ? 'bg-amber-500/10 text-brand-gold' : 'bg-emerald-500/10 text-emerald-400');
                let khr = item.currency === 'KHR' ? item.amount : (item.amount * rate);
                let usd = item.currency === 'USD' ? item.amount : (item.amount / rate);
                const displayIcon = getIconForCategory(item.category);

                return `
                    <div onclick="editTransaction('${item._id}')" class="p-3 rounded-2xl bg-cardBg border border-borderDim hover:border-brand-gold/40 flex items-center justify-between cursor-pointer active:scale-[0.99] transition">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-xl">${displayIcon}</span>
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs font-semibold text-slate-100 truncate">${escapeHTML(item.note || item.category)}</p>
                                <p class="text-[10px] text-slate-400 truncate">${item.category} • ${isTrf ? item.account : (item.account && item.account.includes('Cash') ? 'Cash' : 'ACLEDA')}</p>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <p class="text-xs font-bold ${color} whitespace-nowrap">${sign} ${khr.toLocaleString()} ៛</p>
                            <p class="text-[10px] text-slate-400">≈ $${usd.toFixed(2)}</p>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `).join('');
}

function renderAnalytics() {
    const list = getMonthlyTransactions();
    const catTotals = {};
    let totalExpense = 0;
    let totalIncome = 0;
    const rate = Number(getSettings().exchangeRate) || 4100;

    const badge = document.getElementById('analyticsMonthBadge');
    if (badge) badge.innerText = selectedDate.toLocaleDateString('km-KH', { month: 'short', year: 'numeric' });

    list.forEach(t => {
        if (t.type === 'transfer') return;
        let khr = t.currency === 'KHR' ? t.amount : (t.amount * rate);
        if (t.type === 'income') {
            totalIncome += khr;
        } else {
            catTotals[t.category] = (catTotals[t.category] || 0) + khr;
            totalExpense += khr;
        }
    });

    // Daily Average & Savings Rate
    const now = new Date();
    const isCurrentMonth = selectedDate.getMonth() === now.getMonth() && selectedDate.getFullYear() === now.getFullYear();
    const daysCount = isCurrentMonth ? now.getDate() : new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    const dailyAvgKHR = Math.round(totalExpense / Math.max(daysCount, 1));
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

    const elAvg = document.getElementById('analyticsDailyAvg');
    const elRate = document.getElementById('analyticsSavingsRate');
    if (elAvg) elAvg.innerText = `${dailyAvgKHR.toLocaleString()} ៛`;
    if (elRate) {
        elRate.innerText = `${savingsRate}%`;
        elRate.className = `text-sm font-extrabold mt-1 ${savingsRate >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    const donut = document.getElementById('analyticsDonut');
    const donutTotal = document.getElementById('donutTotalUSD');
    const colors = ['#f3bc3e', '#34d399', '#fb7185', '#38bdf8', '#a78bfa', '#fb923c'];
    donutTotal.innerText = `$${(totalExpense / rate).toFixed(2)}`;

    const cats = Object.keys(catTotals);
    if (cats.length === 0) {
        donut.style.background = 'conic-gradient(#2a2b30 0% 100%)';
        document.getElementById('categoryBars').innerHTML = `<div class="text-xs text-slate-500 py-4 text-center">មិនទាន់មានទិន្នន័យចំណាយក្នុងខែនេះទេ</div>`;
    } else {
        let currentPct = 0;
        const stops = cats.map((cat, idx) => {
            const pct = (catTotals[cat] / totalExpense) * 100;
            const start = currentPct;
            currentPct += pct;
            return `${colors[idx % colors.length]} ${start}% ${currentPct}%`;
        });
        donut.style.background = `conic-gradient(${stops.join(', ')})`;

        document.getElementById('categoryBars').innerHTML = cats.map((cat, idx) => {
            const amount = catTotals[cat];
            const pct = Math.round((amount / totalExpense) * 100);
            const c = colors[idx % colors.length];
            return `
                <div class="space-y-1">
                    <div class="flex justify-between text-xs">
                        <span class="text-slate-300 flex items-center gap-1.5">
                            <span class="w-2.5 h-2.5 rounded-full" style="background:${c}"></span>${escapeHTML(cat)}
                        </span>
                        <span class="font-bold text-brand-gold">${amount.toLocaleString()} ៛ (${pct}%)</span>
                    </div>
                    <div class="w-full h-2 rounded-full bg-darkBg overflow-hidden">
                        <div class="h-full rounded-full" style="width: ${pct}%; background:${c}"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    let cashTotal = 0, bankTotal = 0;
    list.filter(t => t.type === 'expense').forEach(t => {
        let khr = t.currency === 'KHR' ? t.amount : (t.amount * rate);
        if (t.account && t.account.includes('Cash')) cashTotal += khr;
        else bankTotal += khr;
    });

    document.getElementById('accountBreakdown').innerHTML = `
        <div class="p-3 rounded-xl bg-darkBg border border-borderDim">
            <p class="text-[10px] text-slate-400">កាបូបសាច់ប្រាក់ (Cash)</p>
            <p class="text-xs font-bold text-white mt-1">${cashTotal.toLocaleString()} ៛</p>
        </div>
        <div class="p-3 rounded-xl bg-darkBg border border-borderDim">
            <p class="text-[10px] text-slate-400">ធនាគារ ACLEDA</p>
            <p class="text-xs font-bold text-white mt-1">${bankTotal.toLocaleString()} ៛</p>
        </div>
    `;

    renderSavingsGoals();
    renderRecurringBills();
}

// --- 11. Settings, Modals & Quick Calculator ---
function continueAdding() {
    formState.rawAmount = '0';
    document.getElementById('txNoteInput').value = '';
    updateFormAmountDisplay();
    document.getElementById('successModal').classList.add('hidden');
}

function goToDashboardAfterSave() {
    document.getElementById('successModal').classList.add('hidden');
    switchTab('dashboard');
}

function renderSettings() {
    const settings = getSettings();
    document.getElementById('settingRateInput').value = settings.exchangeRate || 4100;
    document.getElementById('settingBudgetInput').value = settings.monthlyBudgetUSD || 300;
    document.getElementById('settingSoundToggle').checked = settings.soundEnabled;
    document.getElementById('settingHapticToggle').checked = settings.hapticEnabled;
    if (currentUser) document.getElementById('settingsUserEmail').innerText = currentUser.email;
}

function saveSettingsForm() {
    const rateVal = Number(document.getElementById('settingRateInput').value) || 4100;
    const budgetVal = Number(document.getElementById('settingBudgetInput').value) || 300;
    const soundVal = document.getElementById('settingSoundToggle').checked;
    const hapticVal = document.getElementById('settingHapticToggle').checked;

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({
        exchangeRate: rateVal, monthlyBudgetUSD: budgetVal, soundEnabled: soundVal, hapticEnabled: hapticVal
    }));
    playRoyalFeedback('success');
    showToast('បានរក្សាទុកការកំណត់ជោគជ័យ!', 'success');
    loadAndRenderDashboard();
}

function exportToCSV() {
    const list = getMonthlyTransactions();
    if (list.length === 0) return showToast('មិនមានទិន្នន័យសម្រាប់ទាញយកទេ!', 'error');

    let csv = '\uFEFFDate,Type,Category,Amount,Currency,Account,Note\n';
    list.forEach(t => {
        const d = t.created_at ? new Date(t.created_at).toLocaleDateString('en-CA') : '';
        const note = (t.note || '').replace(/,/g, ' ');
        csv += `${d},${t.type},"${t.category}",${t.amount},${t.currency},"${t.account}","${note}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sovann_Ledger_${selectedDate.getFullYear()}_${selectedDate.getMonth() + 1}.csv`;
    a.click();
    showToast('បានទាញយកឯកសារ CSV រួចរាល់!', 'success');
}

function testFeedback() { playRoyalFeedback('success'); }
function toggleSyncModal(show) {
    document.getElementById('syncModal').classList.toggle('hidden', !show);
}

const qcUSD = document.getElementById('quickCalcUSD');
const qcKHR = document.getElementById('quickCalcKHR');
qcUSD.addEventListener('input', () => {
    const rate = Number(getSettings().exchangeRate) || 4100;
    qcKHR.value = Math.round(Number(qcUSD.value || 0) * rate);
});
qcKHR.addEventListener('input', () => {
    const rate = Number(getSettings().exchangeRate) || 4100;
    qcUSD.value = (Number(qcKHR.value || 0) / rate).toFixed(2);
});
function updateUserProfileUI() {
    if (!currentUser) return;
    // យកឈ្មោះពីផ្នែកខាងមុខ @ នៃអ៊ីមែល បើមិនទាន់មានឈ្មោះ
    const displayName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    
    const headerName = document.getElementById('headerUserName');
    const settingsName = document.getElementById('settingsUserName');
    const settingsEmail = document.getElementById('settingsUserEmail');

    if (headerName) headerName.innerHTML = `${escapeHTML(displayName)} <span class="material-symbols-outlined text-brand-gold text-[15px]">verified</span>`;
    if (settingsName) settingsName.innerHTML = `${escapeHTML(displayName)} <span class="material-symbols-outlined text-brand-gold text-base">verified</span>`;
    if (settingsEmail) settingsEmail.innerText = currentUser.email;
}
function updateOnlineStatus() {
    const badge = document.getElementById('headerSyncBadge');
    if (!badge) return;
    const parentBtn = badge.parentElement;
    const dot = parentBtn.querySelector('span:first-child');

    if (navigator.onLine) {
        badge.innerText = 'Online';
        parentBtn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-medium cursor-pointer transition';
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    } else {
        badge.innerText = 'Offline';
        parentBtn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/60 border border-rose-500/30 text-rose-400 text-xs font-medium cursor-pointer transition';
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-rose-400';
        showToast('អ្នកកំពុងស្ថិតនៅ Offline (គ្មានអ៊ីនធឺណិត)', 'error');
    }
}

window.addEventListener('online', () => { updateOnlineStatus(); showToast('អ៊ីនធឺណិតបានភ្ជាប់ឡើងវិញ!', 'success'); });
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();
function toggleCalcModal(show) {
    document.getElementById('calcModal').classList.toggle('hidden', !show);
}

function toggleSearchBox() {
    const box = document.getElementById('searchBoxContainer');
    const input = document.getElementById('txSearchInput');
    if (!box) return;
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
        input.focus();
    } else {
        input.value = '';
        handleSearch('');
    }
}

// --- 12. Savings Goals ---
const STORAGE_KEY_GOALS = 'sovann_goals';
let activeDepositGoalId = null;

function getGoals() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_GOALS)) || []; }
    catch (e) { return []; }
}
function saveGoals(goals) { localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals)); }

function renderSavingsGoals() {
    const container = document.getElementById('savingsGoalsList');
    if (!container) return;
    const goals = getGoals();
    if (goals.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-2">មិនទាន់មានគោលដៅសន្សំទេ</p>`;
        return;
    }
    container.innerHTML = goals.map(g => {
        const pct = Math.min(Math.round((g.saved / g.target) * 100), 100);
        return `
            <div class="p-3 rounded-xl bg-darkBg border border-borderDim space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-white">${escapeHTML(g.name)}</span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="openGoalDepositModal(${g.id})" class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">+ ដាក់លុយ</button>
                        <button onclick="deleteGoal(${g.id})" class="text-slate-500 hover:text-rose-400"><span class="material-symbols-outlined text-sm">delete</span></button>
                    </div>
                </div>
                <div class="w-full h-1.5 rounded-full bg-cardBg overflow-hidden">
                    <div class="h-full bg-brand-gold rounded-full transition-all" style="width:${pct}%"></div>
                </div>
                <div class="flex justify-between text-[10px] text-slate-400">
                    <span>សន្សំបាន៖ <strong class="text-emerald-400">$${g.saved.toFixed(2)}</strong></span>
                    <span>គោលដៅ៖ $${g.target.toFixed(2)} (${pct}%)</span>
                </div>
            </div>
        `;
    }).join('');
}

function openGoalModal() {
    document.getElementById('goalNameInput').value = '';
    document.getElementById('goalTargetInput').value = '';
    document.getElementById('goalModal').classList.remove('hidden');
}
function closeGoalModal() { document.getElementById('goalModal').classList.add('hidden'); }
function submitNewGoal() {
    const name = document.getElementById('goalNameInput').value.trim();
    const target = Number(document.getElementById('goalTargetInput').value);
    if (!name || target <= 0) return showToast('សូមបញ្ចូលឈ្មោះ និងទឹកប្រាក់គោលដៅ!', 'error');
    const goals = getGoals();
    goals.push({ id: Date.now(), name, target, saved: 0 });
    saveGoals(goals);
    closeGoalModal();
    renderSavingsGoals();
    showToast('បានបង្កើតគោលដៅសន្សំជោគជ័យ!', 'success');
}
function openGoalDepositModal(id) {
    const g = getGoals().find(x => x.id === id);
    if (!g) return;
    activeDepositGoalId = id;
    document.getElementById('goalDepositTitle').innerText = `បន្ថែមប្រាក់៖ ${g.name}`;
    document.getElementById('goalDepositAmount').value = '';
    document.getElementById('goalDepositModal').classList.remove('hidden');
}
function closeGoalDepositModal() { document.getElementById('goalDepositModal').classList.add('hidden'); }
function submitGoalDeposit() {
    const amt = Number(document.getElementById('goalDepositAmount').value);
    if (amt <= 0) return showToast('សូមបញ្ចូលចំនួនប្រាក់!', 'error');
    const goals = getGoals();
    const g = goals.find(x => x.id === activeDepositGoalId);
    if (g) {
        g.saved += amt;
        saveGoals(goals);
        playRoyalFeedback('success');
        showToast(`បានបន្ថែម $${amt} ចូលគោលដៅសន្សំ!`, 'success');
    }
    closeGoalDepositModal();
    renderSavingsGoals();
}
function deleteGoal(id) {
    openConfirmModal('តើអ្នកចង់លុបគោលដៅសន្សំនេះមែនទេ?', () => {
        saveGoals(getGoals().filter(x => x.id !== id));
        renderSavingsGoals();
        showToast('បានលុបគោលដៅសន្សំរួចរាល់', 'success');
    });
}

// --- 13. 4-Digit PIN Lock ---
const STORAGE_KEY_PIN = 'sovann_pin';
let pinMode = 'unlock';
let pinBuffer = '';
let tempPin = '';

function updatePinDots() {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById('pinDot' + i);
        if (dot) dot.className = i < pinBuffer.length
            ? 'w-3.5 h-3.5 rounded-full bg-brand-gold border-2 border-brand-gold transition'
            : 'w-3.5 h-3.5 rounded-full border-2 border-brand-gold/50 transition';
    }
}

function renderPinSettingsUI() {
    const hasPin = !!localStorage.getItem(STORAGE_KEY_PIN);
    const badge = document.getElementById('pinStatusBadge');
    const btnDis = document.getElementById('btnDisablePin');
    if (badge) {
        badge.innerText = hasPin ? 'កំពុងបើក' : 'បានបិទ';
        badge.className = hasPin ? 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400' : 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-darkBg text-slate-400';
    }
    if (btnDis) btnDis.classList.toggle('hidden', !hasPin);
}

function initPinLock() {
    renderPinSettingsUI();
    if (localStorage.getItem(STORAGE_KEY_PIN)) {
        pinMode = 'unlock';
        pinBuffer = '';
        updatePinDots();
        document.getElementById('pinTitle').innerText = 'បញ្ចូលលេខកូដ PIN';
        document.getElementById('pinSubtitle').innerText = 'ដើម្បីដោះសោកម្មវិធី សុវណ្ណ Ledger';
        document.getElementById('btnPinCancel').classList.add('invisible');
        document.getElementById('pinLockOverlay').classList.remove('hidden');
    }
}

function startPinSetup() {
    pinMode = 'setup';
    pinBuffer = '';
    tempPin = '';
    updatePinDots();
    document.getElementById('pinTitle').innerText = 'បង្កើតលេខកូដ PIN ៤ ខ្ទង់';
    document.getElementById('pinSubtitle').innerText = 'សូមវាយលេខសម្ងាត់ថ្មីរបស់អ្នក';
    document.getElementById('btnPinCancel').classList.remove('invisible');
    document.getElementById('pinLockOverlay').classList.remove('hidden');
}

function cancelPinSetup() {
    pinBuffer = '';
    document.getElementById('pinLockOverlay').classList.add('hidden');
}

function disablePinLock() {
    openConfirmModal('តើអ្នកចង់បិទលេខកូដ PIN ការពារកម្មវិធីមែនទេ?', () => {
        localStorage.removeItem(STORAGE_KEY_PIN);
        renderPinSettingsUI();
        showToast('បានបិទសោ PIN រួចរាល់', 'success');
    });
}

function pressPinKey(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += digit;
    updatePinDots();
    if (pinBuffer.length === 4) {
        setTimeout(() => {
            if (pinMode === 'unlock') {
                if (pinBuffer === localStorage.getItem(STORAGE_KEY_PIN)) {
                    document.getElementById('pinLockOverlay').classList.add('hidden');
                    playRoyalFeedback('success');
                } else {
                    showToast('លេខកូដ PIN មិនត្រឹមត្រូវទេ!', 'error');
                    pinBuffer = '';
                    updatePinDots();
                }
            } else if (pinMode === 'setup') {
                tempPin = pinBuffer;
                pinBuffer = '';
                pinMode = 'confirm';
                updatePinDots();
                document.getElementById('pinTitle').innerText = 'បញ្ជាក់លេខកូដ PIN';
                document.getElementById('pinSubtitle').innerText = 'សូមវាយលេខកូដម្តងទៀតដើម្បីបញ្ជាក់';
            } else if (pinMode === 'confirm') {
                if (pinBuffer === tempPin) {
                    localStorage.setItem(STORAGE_KEY_PIN, pinBuffer);
                    document.getElementById('pinLockOverlay').classList.add('hidden');
                    renderPinSettingsUI();
                    playRoyalFeedback('success');
                    showToast('បានកំណត់លេខកូដ PIN ជោគជ័យ!', 'success');
                } else {
                    showToast('លេខកូដមិនត្រូវគ្នាទេ! សូមសាកម្តងទៀត', 'error');
                    startPinSetup();
                }
            }
        }, 120);
    }
}

function backspacePin() {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
}
// --- 14. Recurring Bills (វិក្កយបត្រប្រចាំខែ) ---
const STORAGE_KEY_BILLS = 'sovann_recurring_bills';

function getRecurringBills() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_BILLS)) || []; }
    catch (e) { return []; }
}
function saveRecurringBills(bills) { localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(bills)); }

function renderRecurringBills() {
    const container = document.getElementById('recurringBillsList');
    if (!container) return;
    const bills = getRecurringBills();
    if (bills.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-2">មិនទាន់មានវិក្កយបត្រប្រចាំខែទេ</p>`;
        return;
    }

    const currentMonthKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth() + 1}`;
    container.innerHTML = bills.map(b => {
        const isPaid = b.lastPaidMonth === currentMonthKey;
        const unit = b.currency === 'USD' ? '$' : ' ៛';
        const amtText = b.currency === 'USD' ? `$${Number(b.amount).toLocaleString()}` : `${Number(b.amount).toLocaleString()} ៛`;
        return `
            <div class="p-3 rounded-xl bg-darkBg border border-borderDim flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <p class="text-xs font-bold text-white truncate">${escapeHTML(b.name)}</p>
                    <p class="text-[10px] text-slate-400">ថ្ងៃទី ${b.dueDay || 1} រៀងរាល់ខែ • <span class="text-brand-gold font-semibold">${amtText}</span></p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    ${isPaid
                        ? `<span class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center gap-0.5"><span class="material-symbols-outlined text-xs">check</span>បានបង់</span>`
                        : `<button onclick="payRecurringBill(${b.id})" class="px-2.5 py-1 rounded-lg bg-brand-gold text-black text-[10px] font-bold active:scale-95 transition">បង់ប្រាក់</button>`
                    }
                    <button onclick="deleteRecurringBill(${b.id})" class="text-slate-500 hover:text-rose-400 p-0.5"><span class="material-symbols-outlined text-sm">delete</span></button>
                </div>
            </div>
        `;
    }).join('');
}

function openBillModal() {
    document.getElementById('billNameInput').value = '';
    document.getElementById('billAmountInput').value = '';
    document.getElementById('billDayInput').value = '1';
    document.getElementById('billModal').classList.remove('hidden');
}
function closeBillModal() { document.getElementById('billModal').classList.add('hidden'); }

function submitNewBill() {
    const name = document.getElementById('billNameInput').value.trim();
    const amount = Number(document.getElementById('billAmountInput').value);
    const currency = document.getElementById('billCurrencyInput').value;
    const dueDay = Math.min(Math.max(Number(document.getElementById('billDayInput').value) || 1, 1), 31);

    if (!name || amount <= 0) return showToast('សូមបញ្ចូលឈ្មោះ និងទឹកប្រាក់!', 'error');
    const bills = getRecurringBills();
    bills.push({ id: Date.now(), name, amount, currency, dueDay, lastPaidMonth: '' });
    saveRecurringBills(bills);
    closeBillModal();
    renderRecurringBills();
    showToast('បានបន្ថែមវិក្កយបត្រប្រចាំខែជោគជ័យ!', 'success');
}

function payRecurringBill(id) {
    const bills = getRecurringBills();
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    if (!supabaseClient || !currentUser) return showToast('សូម Login ជាមុនសិន!', 'error');

    openConfirmModal(`បញ្ជាក់ការបង់ប្រាក់ "${bill.name}" ហើយកត់ត្រាចូលចំណាយខែនេះ?`, async () => {
        const txPayload = {
            _id: Date.now(),
            user_id: currentUser.id,
            type: 'expense',
            amount: bill.amount,
            currency: bill.currency,
            category: 'ទឹកភ្លើង & Wi-Fi',
            note: `${bill.name} (ប្រចាំខែ)`,
            account: 'ធនាគារ ACLEDA',
            created_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('transactions').insert([txPayload]);
        if (error) return showToast('បរាជ័យ៖ ' + error.message, 'error');

        bill.lastPaidMonth = `${selectedDate.getFullYear()}-${selectedDate.getMonth() + 1}`;
        saveRecurringBills(bills);
        currentTransactions.unshift(txPayload);
        playRoyalFeedback('success');
        showToast(`បានបង់ និងកត់ត្រា "${bill.name}" រួចរាល់!`, 'success');
        renderAnalytics();
    });
}

function deleteRecurringBill(id) {
    openConfirmModal('តើអ្នកចង់លុបវិក្កយបត្រប្រចាំខែនេះមែនទេ?', () => {
        saveRecurringBills(getRecurringBills().filter(b => b.id !== id));
        renderRecurringBills();
        showToast('បានលុបវិក្កយបត្រប្រចាំខែរួចរាល់', 'success');
    });
}
// --- On Load ---
initDataStore();
updateFormAmountDisplay();
initPinLock();
checkUserSession();
// ចុះឈ្មោះ Service Worker សម្រាប់ PWA Offline
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.log('SW Error:', err));
    });
}
