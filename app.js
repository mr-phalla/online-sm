/**
 * SOVANN EXPENSE LEDGER - APP.JS
 * ភ្ជាប់ជាមួយ Supabase, Auth, CRUD និង Tesseract OCR
 */

// --- 1. រៀបចំ SUPABASE ---
const supabaseUrl = 'https://sltfbvmnlybtdxyaeusd.supabase.co';
const supabaseKey = 'sb_publishable_3F1WJOvHe8x1iwYtcUPxkw_1mHm9MzE';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    console.log("ភ្ជាប់ Supabase បានជោគជ័យ!");
} else {
    console.error("មិនអាចស្វែងរក Supabase Library ទេ។ សូមពិនិត្យមើល tag <script> នៅក្នុង HTML របស់អ្នក។");
}

// --- 2. អថេរ និងទិន្នន័យ (State) ---
const STORAGE_KEY_SETTINGS = 'sovann_settings';
const DEFAULT_SETTINGS = { exchangeRate: 4100, soundEnabled: true, hapticEnabled: true };

let currentUser = null; 
let currentTransactions = []; 
let scannedResult = { amount: 0, currency: 'KHR' }; // សម្រាប់ផ្ទុកទិន្នន័យស្កេនបណ្តោះអាសន្ន

let formState = {
    type: 'expense',
    currency: 'KHR',
    rawAmount: '0',
    category: 'ម្ហូប & ភេសជ្ជៈ',
    icon: 'restaurant',
    account: 'កាបូបសាច់ប្រាក់ (Cash)',
    note: ''
};

// --- 3. មុខងារគ្រប់គ្រងគណនី (AUTHENTICATION) ---
async function checkUserSession() {
    if (!supabaseClient) return;
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        switchTab('dashboard'); 
    } else {
        currentUser = null;
        switchTab('auth'); 
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            switchTab('dashboard');
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentTransactions = [];
            switchTab('auth');
        }
    });
}

async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    if(!email || !password) return alert("សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់!");

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert("ការចូលគណនីបរាជ័យ៖ " + error.message);
}

async function handleSignUp() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    if(!email || !password) return alert("សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់!");

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert("ការបង្កើតគណនីបរាជ័យ៖ " + error.message);
    else alert("បង្កើតគណនីជោគជ័យ! សូមចុច Login។");
}

async function handleLogout() {
    if (confirm('តើអ្នកពិតជាចង់ចាកចេញមែនទេ?')) {
        await supabaseClient.auth.signOut();
    }
}

// --- 4. មុខងារទូទៅ (Helper Functions) ---
function initDataStore() {
    if (!localStorage.getItem(STORAGE_KEY_SETTINGS)) {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    }
}

function getSettings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS)) || DEFAULT_SETTINGS; } 
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

// --- 5. មុខងារបញ្ជាអេក្រង់ (Navigation) ---
function switchTab(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }

    const navItems = ['dashboard', 'analytics', 'camera', 'settings'];
    navItems.forEach(item => {
        const btn = document.getElementById('nav-' + item);
        if (btn) {
            btn.className = (item === pageId) 
                ? 'flex flex-col items-center text-brand-gold gap-0.5' 
                : 'flex flex-col items-center text-slate-400 hover:text-slate-200 gap-0.5';
        }
    });

    const dock = document.getElementById('bottomDock');
    if (pageId === 'camera' || pageId === 'add' || pageId === 'auth') {
        dock.style.display = 'none';
    } else {
        dock.style.display = 'flex';
    }

    if (pageId === 'dashboard') loadAndRenderDashboard();
    if (pageId === 'analytics') renderAnalytics();
    if (pageId === 'settings') renderSettings();
}

function openAddForm(type = 'expense') {
    setTxType(type);
    formState.rawAmount = '0';
    document.getElementById('txNoteInput').value = '';
    updateFormAmountDisplay();
    switchTab('add');
}

// --- 6. មុខងារទម្រង់បញ្ចូលទិន្នន័យ (Form Logic) ---
function setTxType(type) {
    formState.type = type;
    const btnExp = document.getElementById('tabExpense');
    const btnInc = document.getElementById('tabIncome');
    const sign = document.getElementById('amountSign');
    const headerTitle = document.getElementById('formHeaderTitle');

    if (type === 'expense') {
        btnExp.className = 'py-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center gap-1 transition';
        btnInc.className = 'py-2 rounded-lg text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 transition';
        sign.className = 'text-rose-400';
        sign.innerText = '-';
        headerTitle.innerText = 'កត់ត្រាចំណាយ (Add Expense)';
    } else {
        btnInc.className = 'py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1 transition';
        btnExp.className = 'py-2 rounded-lg text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 transition';
        sign.className = 'text-emerald-400';
        sign.innerText = '+';
        headerTitle.innerText = 'កត់ត្រាចំណូល (Add Income)';
    }
}

function setCurrency(curr) {
    formState.currency = curr;
    const khrBtn = document.getElementById('formCurrKHR');
    const usdBtn = document.getElementById('formCurrUSD');
    if (curr === 'KHR') {
        khrBtn.className = 'px-3 py-1 rounded bg-brand-gold text-black transition';
        usdBtn.className = 'px-3 py-1 rounded text-slate-400 hover:text-white transition';
    } else {
        usdBtn.className = 'px-3 py-1 rounded bg-brand-gold text-black transition';
        khrBtn.className = 'px-3 py-1 rounded text-slate-400 hover:text-white transition';
    }
    updateFormAmountDisplay();
}

function updateFormAmountDisplay() {
    const num = Number(formState.rawAmount || 0);
    const rate = Number(getSettings().exchangeRate) || 4100;
    const disp = document.getElementById('amountDisplay');
    const unit = document.getElementById('amountUnit');
    const sub = document.getElementById('convertedSub');
    const rateLabel = document.getElementById('formRateLabel');

    rateLabel.innerText = `1$ = ${rate.toLocaleString()} ៛`;
    disp.value = num.toLocaleString();

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
        if (formState.rawAmount === '0') formState.rawAmount = v;
        else formState.rawAmount += v;
        updateFormAmountDisplay();
    });
});

document.getElementById('npBack').addEventListener('click', () => {
    formState.rawAmount = formState.rawAmount.slice(0, -1);
    if (formState.rawAmount === '') formState.rawAmount = '0';
    updateFormAmountDisplay();
});

document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill').forEach(p => {
            p.className = 'cat-pill p-2.5 rounded-xl bg-cardBg border border-borderDim text-slate-300 flex flex-col items-center gap-1 active:scale-95 transition';
        });
        pill.className = 'cat-pill p-2.5 rounded-xl bg-cardBg border-2 border-brand-gold text-brand-gold flex flex-col items-center gap-1 active:scale-95 transition';
        formState.category = pill.getAttribute('data-name');
        formState.icon = pill.getAttribute('data-icon');
    });
});

// --- 7. កាមេរ៉ាស្កេន និង OCR (Tesseract.js) ---
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
        if(typeof Tesseract === 'undefined') {
            alert("Tesseract Library មិនទាន់ដំណើរការទេ។");
            return;
        }

        const result = await Tesseract.recognize(file, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    statusText.innerText = `កំពុងវិភាគ... ${Math.round(m.progress * 100)}%`;
                }
            }
        });

        const text = result.data.text;
        console.log("អត្ថបទស្កេនបាន:\n", text);

        const numberMatches = text.match(/\d+([.,]\d+)?/g);
        let highestAmount = 0;
        
        if (numberMatches) {
            numberMatches.forEach(numStr => {
                const val = parseFloat(numStr.replace(/,/g, ''));
                if (val > highestAmount) highestAmount = val;
            });
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
            alert("សុំទោស AI មិនអាចរកឃើញតួលេខទឹកប្រាក់ក្នុងរូបភាពនេះទេ។");
            statusText.innerText = "ស្កេនបរាជ័យ";
        }

    } catch (err) {
        console.error("OCR Error:", err);
        alert("មានបញ្ហាក្នុងការស្កេនរូបភាព។");
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
    formState.type = 'expense';
    formState.currency = scannedResult.currency;
    formState.rawAmount = scannedResult.amount.toString();
    formState.category = 'ផ្សេងៗ (Other)'; 
    formState.icon = 'more_horiz';
    
    document.getElementById('txNoteInput').value = 'វិក្កយបត្រ (បានស្កេន)';
    
    setTxType('expense');
    setCurrency(formState.currency);
    updateFormAmountDisplay();
    
    switchTab('add');
}


// --- 8. SUPABASE CRUD (បញ្ជូន ទាញ និងលុប) ---
document.getElementById('txForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveCurrentFormTransaction();
});

async function saveCurrentFormTransaction() {
    if (!supabaseClient || !currentUser) {
        alert("សូម Login ជាមុនសិនទើបអាចរក្សាទុកបាន!");
        return;
    }

    const rate = Number(getSettings().exchangeRate) || 4100;
    const num = Number(formState.rawAmount || 0);

    if (num <= 0) return alert("សូមបញ្ចូលចំនួនទឹកប្រាក់!");

    const accountVal = document.querySelector('input[name="accountChoice"]:checked').value;
    const noteVal = document.getElementById('txNoteInput').value;

    const newTx = {
        user_id: currentUser.id,
        type: formState.type,
        amount: num,
        currency: formState.currency,
        category: formState.category,
        note: noteVal,
        account: accountVal
    };

    try {
        const submitBtn = document.querySelector('#txForm button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> កំពុងរក្សាទុក...';
        submitBtn.disabled = true;

        const { error } = await supabaseClient.from('transactions').insert([newTx]);
            
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;

        if (error) {
            console.error(error);
            return alert("បរាជ័យក្នុងការរក្សាទុកទៅកាន់ Cloud។ សូមពិនិត្យ Column 'account' ក្នុង Database។");
        }

        playRoyalFeedback('success');

        let khr = formState.currency === 'KHR' ? num : Math.round(num * rate);
        let usd = formState.currency === 'KHR' ? Number((num / rate).toFixed(2)) : num;
        
        const prefix = formState.type === 'expense' ? '-' : '+';
        document.getElementById('modalDispAmount').innerText = `${prefix} ${khr.toLocaleString()} ៛ (≈ $${usd.toFixed(2)})`;
        document.getElementById('modalDispCat').innerText = formState.category;
        document.getElementById('modalDispAcc').innerText = accountVal;

        document.querySelector('#successModal h3').innerText = "រក្សាទុកជោគជ័យ!";
        document.querySelector('#successModal p').innerText = "ទិន្នន័យត្រូវបានកត់ត្រាចូល Cloud រួចរាល់។";
        document.getElementById('successModal').classList.remove('hidden');

    } catch (err) {
        alert("មានកំហុសប្រព័ន្ធ!");
    }
}

async function loadAndRenderDashboard() {
    if (!supabaseClient || !currentUser) return;

    try {
        document.getElementById('txListDashboard').innerHTML = `
            <div class="flex justify-center p-6">
                <span class="material-symbols-outlined animate-spin text-brand-gold text-3xl">sync</span>
            </div>`;

        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        currentTransactions = data || [];
        renderDashboardUI();
    } catch (error) {
        document.getElementById('txListDashboard').innerHTML = `<div class="p-6 text-center text-xs text-rose-500 bg-cardBg rounded-2xl border border-borderDim">មានបញ្ហាក្នុងការទាញទិន្នន័យ</div>`;
    }
}

async function deleteTransaction(id) {
    if (!confirm('តើអ្នកពិតជាចង់លុបប្រតិបត្តិការនេះមែនទេ?')) return;
    if (!supabaseClient) return;

    try {
        const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
        if (error) throw error;
        playRoyalFeedback('delete');
        loadAndRenderDashboard();
    } catch (error) {
        alert("មានបញ្ហាក្នុងការលុបទិន្នន័យ។");
    }
}

// --- 9. មុខងារបង្ហាញ UI (Render Functions) ---
function getIconForCategory(category) {
    const iconMap = {
        'ម្ហូប & ភេសជ្ជៈ': 'restaurant',
        'ធ្វើដំណើរ / សាំង': 'directions_car',
        'ទឹកភ្លើង & Wi-Fi': 'bolt',
        'ទិញទំនិញ (Shopping)': 'shopping_bag',
        'ប្រាក់បៀវត្សរ៍ (Salary)': 'payments',
        'ផ្សេងៗ (Other)': 'more_horiz'
    };
    return iconMap[category] || 'receipt_long';
}

function renderDashboardUI() {
    const rate = Number(getSettings().exchangeRate) || 4100;
    const list = currentTransactions;

    document.getElementById('dispNBCRate').innerText = `1$ = ${rate.toLocaleString()} ៛`;
    document.getElementById('calcRateLabel').innerText = `1$ = ${rate.toLocaleString()}៛`;

    let totalIncKHR = 0, totalIncUSD = 0, totalExpKHR = 0, totalExpUSD = 0;

    list.forEach(item => {
        let khr = item.currency === 'KHR' ? item.amount : (item.amount * rate);
        let usd = item.currency === 'USD' ? item.amount : (item.amount / rate);

        if (item.type === 'income') {
            totalIncKHR += khr; totalIncUSD += usd;
        } else {
            totalExpKHR += khr; totalExpUSD += usd;
        }
    });

    const netKHR = totalIncKHR - totalExpKHR;
    const netUSD = totalIncUSD - totalExpUSD;

    document.getElementById('heroKHR').innerHTML = `${netKHR.toLocaleString()} <span class="text-brand-gold text-2xl font-bold">៛</span>`;
    document.getElementById('heroUSD').innerText = `≈ $${netUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    document.getElementById('monthIncUSD').innerText = `+$${totalIncUSD.toFixed(2)}`;
    document.getElementById('monthIncKHR').innerText = `${totalIncKHR.toLocaleString()} ៛`;
    document.getElementById('monthExpUSD').innerText = `-$${totalExpUSD.toFixed(2)}`;
    document.getElementById('monthExpKHR').innerText = `${totalExpKHR.toLocaleString()} ៛`;
    document.getElementById('txCountBadge').innerText = `${list.length} ប្រតិបត្តិការ`;

    const container = document.getElementById('txListDashboard');
    if (list.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 bg-cardBg rounded-2xl border border-borderDim">មិនទាន់មានប្រតិបត្តិការនៅឡើយទេ</div>`;
        return;
    }

    container.innerHTML = list.map(item => {
        const isExp = item.type === 'expense';
        const color = isExp ? 'text-rose-400' : 'text-emerald-400';
        const sign = isExp ? '-' : '+';
        const iconBg = isExp ? 'bg-amber-500/10 text-brand-gold' : 'bg-emerald-500/10 text-emerald-400';
        let khr = item.currency === 'KHR' ? item.amount : (item.amount * rate);
        let usd = item.currency === 'USD' ? item.amount : (item.amount / rate);
        const displayIcon = getIconForCategory(item.category);

        return `
            <div class="p-3 rounded-2xl bg-cardBg border border-borderDim flex items-center justify-between group relative overflow-hidden">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-xl">${displayIcon}</span>
                    </div>
                    <div class="min-w-0">
                        <p class="text-xs font-semibold text-slate-100 truncate">${item.note || item.category}</p>
                        <p class="text-[10px] text-slate-400 truncate">${item.category}</p>
                    </div>
                </div>
                <div class="text-right flex items-center gap-2">
                    <div>
                        <p class="text-xs font-bold ${color} whitespace-nowrap">${sign} ${khr.toLocaleString()} ៛</p>
                        <p class="text-[10px] text-slate-400">≈ $${usd.toFixed(2)}</p>
                    </div>
                    <button onclick="deleteTransaction('${item.id}')" class="ml-1 p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/30 transition opacity-80 hover:opacity-100 active:scale-95">
                        <span class="material-symbols-outlined text-base">delete</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderAnalytics() {
    const list = currentTransactions;
    const catTotals = {};
    let totalExpense = 0;
    const rate = Number(getSettings().exchangeRate) || 4100;

    list.filter(t => t.type === 'expense').forEach(t => {
        let khr = t.currency === 'KHR' ? t.amount : (t.amount * rate);
        catTotals[t.category] = (catTotals[t.category] || 0) + khr;
        totalExpense += khr;
    });

    const container = document.getElementById('categoryBars');
    if (Object.keys(catTotals).length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-500 py-4 text-center">មិនទាន់មានទិន្នន័យចំណាយនៅឡើយទេ</div>`;
    } else {
        container.innerHTML = Object.keys(catTotals).map(cat => {
            const amount = catTotals[cat];
            const pct = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
            return `
                <div class="space-y-1">
                    <div class="flex justify-between text-xs">
                        <span class="text-slate-300">${cat}</span>
                        <span class="font-bold text-brand-gold">${amount.toLocaleString()} ៛ (${pct}%)</span>
                    </div>
                    <div class="w-full h-2 rounded-full bg-darkBg overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-brand-goldDark to-brand-gold rounded-full" style="width: ${pct}%"></div>
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
            <p class="text-[10px] text-slate-400">គណនីធនាគារ</p>
            <p class="text-xs font-bold text-white mt-1">${bankTotal.toLocaleString()} ៛</p>
        </div>
    `;
}

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
    document.getElementById('settingSoundToggle').checked = settings.soundEnabled;
    document.getElementById('settingHapticToggle').checked = settings.hapticEnabled;
}

function saveSettingsForm() {
    const rateVal = Number(document.getElementById('settingRateInput').value) || 4100;
    const soundVal = document.getElementById('settingSoundToggle').checked;
    const hapticVal = document.getElementById('settingHapticToggle').checked;

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({
        exchangeRate: rateVal, soundEnabled: soundVal, hapticEnabled: hapticVal
    }));
    playRoyalFeedback('success');
    alert('បានរក្សាទុកការកំណត់ជោគជ័យ!');
    loadAndRenderDashboard();
}

function clearAllData() {
    alert('ដើម្បីលុបទិន្នន័យ អ្នកត្រូវចូលទៅកាន់ផ្ទាំងគ្រប់គ្រង (Dashboard) របស់ Supabase ។ (អ្នកអាចលុបប្រតិបត្តិការម្តងមួយៗនៅក្នុងទំព័រដើមបាន)');
}

function testFeedback() {
    playRoyalFeedback('success');
}

function toggleSyncModal(show) {
    const modal = document.getElementById('syncModal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

function installPWA() {
    alert('ដើម្បីដំឡើងលើទូរស័ព្ទ៖\n- លើ Android: ចុចសញ្ញាចុចបី (⋮) -> ជ្រើសរើស "Add to Home screen"\n- លើ iOS/iPhone: ចុច Share (⎋) -> ជ្រើសរើស "Add to Home Screen"');
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

// --- ពេលបើកកម្មវិធីដំបូង (On Load) ---
initDataStore();
updateFormAmountDisplay();
checkUserSession();
