// MIKASA COMMAND CENTER — CLIENT LOGIC & REAL-TIME INTERACTION

let isCommander = false;
let commanderUser = null;

function getAuthToken() {
    return localStorage.getItem('mikasa_commander_token') || '';
}

function authFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = { ...(options.headers || {}) };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    const icon = type === 'warning' ? '🔒' : (type === 'success' ? '✅' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function checkUrlToken() {
    try {
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            localStorage.setItem('mikasa_commander_token', token);
            window.history.replaceState({}, document.title, window.location.pathname);
            showToast("⚔️ Verified Commander token loaded from link.", "success");
        } else if (isLocal) {
            // Auto-grant commander passkey unconditionally on local PC
            localStorage.setItem('mikasa_commander_token', 'MikasaCommander360!');
        }
    } catch (e) {}
}

async function checkCommanderAuth() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    try {
        const res = await authFetch('/api/auth/verify');
        const data = await res.json();
        if (data.isCommander || isLocal) {
            isCommander = true;
            commanderUser = data.user || { name: 'Md. Miftahur Rahman Swapnil (Local PC)' };
            applyCommanderMode();
        } else {
            isCommander = false;
            applyObserverMode();
        }
    } catch (e) {
        if (isLocal) {
            isCommander = true;
            applyCommanderMode();
        } else {
            isCommander = false;
            applyObserverMode();
        }
    }
}

function applyCommanderMode() {
    document.body.classList.remove('observer-mode');
    document.body.classList.add('commander-mode');

    const badgeObserver = document.getElementById('badge-observer');
    const btnLogin = document.getElementById('btn-open-login-modal');
    const badgeCommander = document.getElementById('badge-commander');
    const observerBanner = document.getElementById('observer-mode-banner');

    if (badgeObserver) badgeObserver.style.display = 'none';
    if (btnLogin) btnLogin.style.display = 'none';
    if (badgeCommander) badgeCommander.style.display = 'inline-flex';
    if (observerBanner) observerBanner.style.display = 'none';

    // Enable chat input
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send-chat');
    if (chatInput) {
        chatInput.removeAttribute('disabled');
        chatInput.placeholder = "Talk to Mikasa (Commander Mode)...";
    }
    if (btnSend) btnSend.removeAttribute('disabled');

    // Re-render tasks so checkboxes are interactive
    renderTasks();
}

function applyObserverMode() {
    document.body.classList.remove('commander-mode');
    document.body.classList.add('observer-mode');

    const badgeObserver = document.getElementById('badge-observer');
    const btnLogin = document.getElementById('btn-open-login-modal');
    const badgeCommander = document.getElementById('badge-commander');
    const observerBanner = document.getElementById('observer-mode-banner');

    if (badgeObserver) badgeObserver.style.display = 'inline-flex';
    if (btnLogin) btnLogin.style.display = 'inline-flex';
    if (badgeCommander) badgeCommander.style.display = 'none';
    if (observerBanner) observerBanner.style.display = 'block';

    // Lock chat input for public observers
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send-chat');
    if (chatInput) {
        chatInput.setAttribute('disabled', 'true');
        chatInput.placeholder = "🔒 Public Observer Mode: Commands reserved for Commander Swapnil";
    }
    if (btnSend) btnSend.setAttribute('disabled', 'true');

    // Re-render tasks so checkboxes are disabled
    renderTasks();
}

function initAuthHandlers() {
    document.getElementById('btn-open-login-modal')?.addEventListener('click', () => openModal('modal-commander-login'));
    document.getElementById('btn-banner-login')?.addEventListener('click', () => openModal('modal-commander-login'));

    document.getElementById('btn-commander-logout')?.addEventListener('click', () => {
        localStorage.removeItem('mikasa_commander_token');
        applyObserverMode();
        showToast("Logged out of Commander Mode. Observer Mode active.", "info");
    });

    document.getElementById('form-commander-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (document.getElementById('login-input-email')?.value || '').trim();
        const password = document.getElementById('login-input-password').value;
        const submitBtn = document.getElementById('btn-submit-login');
        const errorEl = document.getElementById('login-error-msg');
        errorEl.style.display = 'none';
        submitBtn.setAttribute('disabled', 'true');
        submitBtn.textContent = 'Verifying...';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success && data.access_token) {
                localStorage.setItem('mikasa_commander_token', data.access_token);
                closeModal('modal-commander-login');
                document.getElementById('form-commander-login').reset();
                await checkCommanderAuth();
                showToast("⚔️ Welcome back, Commander Swapnil. Full authority restored.", "success");
            } else {
                errorEl.textContent = data.error || 'Authentication failed.';
                errorEl.style.display = 'block';
            }
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
        } finally {
            submitBtn.removeAttribute('disabled');
            submitBtn.textContent = 'Verify & Unlock';
        }
    });
}

let cachedQuota = null;

async function loadQuotaTelemetry() {
    try {
        const res = await fetch('/api/quota');
        const data = await res.json();
        cachedQuota = data;
        updateQuotaUI(data);
    } catch (e) {}
}

function updateQuotaUI(q) {
    if (!q) return;
    const textEl = document.getElementById('text-brain');
    const dotEl = document.getElementById('dot-brain');
    const pillEl = document.getElementById('pill-brain');

    if (textEl && dotEl) {
        if (q.is_cooldown) {
            dotEl.style.background = '#f59e0b';
            dotEl.style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.6)';
            textEl.textContent = `OpenRouter (${q.cooldown_remaining_seconds}s reset)`;
            if (pillEl) pillEl.title = `⚠️ Gemini rate limit reached. Auto-routed to OpenRouter. Resets in ${q.cooldown_remaining_seconds}s. Click for details.`;
        } else {
            dotEl.style.background = '#10b981';
            dotEl.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
            textEl.textContent = `Gemini (${q.remaining_this_minute}/20 RPM)`;
            if (pillEl) pillEl.title = `⚡ Gemini: ${q.remaining_this_minute}/20 remaining this minute (resets in ${q.window_reset_seconds}s). Fallback: OpenRouter Instant. Click for details.`;
        }
    }
}

function initQuotaClick() {
    document.getElementById('pill-brain')?.addEventListener('click', () => {
        if (!cachedQuota) {
            showToast("⚡ Checking Gemini quota telemetry...", "info");
            loadQuotaTelemetry();
            return;
        }
        const q = cachedQuota;
        const msg = q.is_cooldown
            ? `⚠️ Gemini rate limited (${q.cooldown_remaining_seconds}s reset). Active: OpenRouter GPT-4o-mini.`
            : `⚡ Gemini: ${q.remaining_this_minute}/20 req remaining this minute (resets in ~${q.window_reset_seconds}s). Daily: ${q.daily_usage}/1,500. Fallback: OpenRouter.`;
        showToast(msg, q.is_cooldown ? 'warning' : 'success');
    });
}

function initHeaderDropdown() {
    const trigger = document.getElementById('btn-actions-dropdown');
    const panel = document.getElementById('actions-dropdown-menu');
    const wrap = document.getElementById('actions-dropdown-wrap');

    if (!trigger || !panel) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('active');
        panel.classList.toggle('active', !isOpen);
        trigger.classList.toggle('active', !isOpen);
    });

    document.addEventListener('click', (e) => {
        if (wrap && !wrap.contains(e.target)) {
            panel.classList.remove('active');
            trigger.classList.remove('active');
        }
    });

    panel.querySelectorAll('.dropdown-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            panel.classList.remove('active');
            trigger.classList.remove('active');
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    checkUrlToken();
    initAuthHandlers();
    initTabs();
    initModals();
    initHeaderDropdown();
    initFilters();
    initChat();
    initCopilotHub();
    initQuotaClick();
    initPCHub();

    // Verify authentication status
    checkCommanderAuth();

    // Initial Data Fetch
    loadTasks();
    loadGoals();
    loadDecisions();
    loadMemories();
    loadProjects();
    loadGitHub();
    loadReminders();
    loadQuotaTelemetry();

    // Poll quota telemetry every 15s
    setInterval(loadQuotaTelemetry, 15000);
});

// --- TAB & SECTOR SWITCHING ---
function initTabs() {
    const sectorBtns = document.querySelectorAll('.sector-tab-btn');
    const sectorPanels = document.querySelectorAll('.sector-panel');

    sectorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sectorBtns.forEach(b => b.classList.remove('active'));
            sectorPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetSectorId = btn.getAttribute('data-sector');
            const targetPanel = document.getElementById(targetSectorId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    // Also support any legacy .tab-btn elements if present
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// --- MODALS & HEADER ACTIONS ---
function initModals() {
    const restrictAction = (callback) => {
        return (e) => {
            if (!isCommander) {
                if (e) e.preventDefault();
                showToast("🔒 Observer Mode: Only verified Commander can modify state.", "warning");
                openModal('modal-commander-login');
                return;
            }
            callback(e);
        };
    };

    // Open triggers protected
    document.getElementById('btn-open-task-modal')?.addEventListener('click', restrictAction(() => openModal('modal-task')));
    document.getElementById('btn-open-goal-modal')?.addEventListener('click', restrictAction(() => openModal('modal-goal')));
    document.getElementById('btn-open-decision-modal')?.addEventListener('click', restrictAction(() => openModal('modal-decision')));
    document.getElementById('btn-open-remind-modal')?.addEventListener('click', restrictAction(() => openModal('modal-reminder')));
    document.getElementById('btn-open-remind-modal-2')?.addEventListener('click', restrictAction(() => openModal('modal-reminder')));

    // Clear Chat Button with protection
    document.getElementById('btn-clear-chat')?.addEventListener('click', restrictAction(async () => {
        if (confirm('Clear chat history for this session?')) {
            try {
                const res = await authFetch('/api/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversation_id: 'commander_session' })
                });
                if (res.status === 403) {
                    showToast("🔒 Observer Mode: Only Commander can clear chat.", "warning");
                    openModal('modal-commander-login');
                    return;
                }
                const container = document.getElementById('chat-messages-container');
                container.innerHTML = `
                    <div class="chat-bubble bubble-mikasa">
                        ⚔️ <strong>The slate is clean, Swapnil.</strong><br><br>
                        Every past message in our conversation has been wiped. It's just you and me with a fresh start.<br><br>
                        <em>What are we conquering today?</em>
                    </div>
                `;
            } catch (e) {
                alert('Error clearing chat: ' + e.message);
            }
        }
    }));

    // Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = btn.getAttribute('data-close');
            if (modalId) closeModal(modalId);
            else {
                const overlay = btn.closest('.modal-overlay');
                if (overlay) overlay.classList.remove('active');
            }
        });
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });

    // Form: New Task
    document.getElementById('form-new-task')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: Only verified Commander can create tasks.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const title = document.getElementById('task-input-title').value.trim();
        const projectHint = document.getElementById('task-select-project').value;
        const priority = parseInt(document.getElementById('task-input-priority').value) || 5;

        try {
            const res = await authFetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, project_hint: projectHint, priority })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Task creation denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            if (res.ok) {
                closeModal('modal-task');
                document.getElementById('form-new-task').reset();
                await loadTasks();
                appendMikasaChatMessage(`I've logged the task *"${title}"* for you in our operational database.`);
            }
        } catch (err) {
            alert('Failed to save task: ' + err.message);
        }
    });

    // Form: New Reminder
    document.getElementById('form-new-reminder')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: Only verified Commander can set reminders.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const text = document.getElementById('reminder-input-text').value.trim();
        const timeStr = document.getElementById('reminder-input-time').value.trim();

        try {
            const res = await authFetch('/api/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, time_str: timeStr })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Reminder creation denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            if (res.ok) {
                closeModal('modal-reminder');
                document.getElementById('form-new-reminder').reset();
                await loadReminders();
                appendMikasaChatMessage(`Reminder locked in: *"${text}"* in *${timeStr}*. I will alert you proactively on Telegram.`);
            }
        } catch (err) {
            alert('Failed to set reminder: ' + err.message);
        }
    });

    // Form: New Goal
    document.getElementById('form-new-goal')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: Only verified Commander can add goals.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const title = document.getElementById('goal-input-title').value.trim();
        const category = document.getElementById('goal-select-category').value;

        try {
            const res = await authFetch('/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, category })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Goal creation denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            if (res.ok) {
                closeModal('modal-goal');
                document.getElementById('form-new-goal').reset();
                await loadGoals();
                appendMikasaChatMessage(`New strategic goal registered: *"${title}"* under [${category}]. Let's keep our eyes forward.`);
            }
        } catch (err) {
            alert('Failed to save goal: ' + err.message);
        }
    });

    // Form: Log Decision
    document.getElementById('form-new-decision')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: Only verified Commander can record decisions.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const decision = document.getElementById('decision-input-text').value.trim();
        const reason = document.getElementById('decision-input-reason').value.trim();
        const projectHint = document.getElementById('decision-select-project').value;

        try {
            const res = await authFetch('/api/decisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, reason, project_hint: projectHint })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Decision logging denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            if (res.ok) {
                closeModal('modal-decision');
                document.getElementById('form-new-decision').reset();
                await loadDecisions();
                appendMikasaChatMessage(`Architectural decision logged: *"${decision}"* for ${projectHint}.`);
            }
        } catch (err) {
            alert('Failed to log decision: ' + err.message);
        }
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

// --- TASK FILTERING ---
let currentTaskFilter = 'all';
let cachedTasks = [];

function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTaskFilter = btn.getAttribute('data-filter');
            renderTasks();
        });
    });
}

// --- DATA FETCHERS ---

// 1. Tasks
async function loadTasks() {
    const container = document.getElementById('tasks-container');
    try {
        const res = await fetch('/api/tasks');
        cachedTasks = await res.json();
        renderTasks();
    } catch (err) {
        container.innerHTML = `<div class="error-state">Error loading tasks: ${err.message}</div>`;
    }
}

function renderTasks() {
    const container = document.getElementById('tasks-container');
    if (!cachedTasks || cachedTasks.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); padding: 20px 0; text-align: center;">No tasks registered yet. Click "Task" in the header to create one.</div>`;
        return;
    }

    let filtered = cachedTasks;
    if (currentTaskFilter === 'todo') {
        filtered = cachedTasks.filter(t => t.status !== 'completed');
    } else if (currentTaskFilter === 'completed') {
        filtered = cachedTasks.filter(t => t.status === 'completed');
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); padding: 20px 0; text-align: center;">No tasks in this view.</div>`;
        return;
    }

    container.innerHTML = filtered.map(t => {
        const isCompleted = t.status === 'completed';
        const prioIcon = t.priority >= 8 ? '🔥' : (t.priority >= 5 ? '⚡' : '📌');
        return `
            <div class="task-hud-item ${isCompleted ? 'completed' : ''}" id="task-item-${t.id}">
                <div class="task-hud-left">
                    <input 
                        type="checkbox" 
                        class="task-checkbox" 
                        ${isCompleted ? 'checked' : ''} 
                        ${!isCommander ? 'disabled' : ''}
                        onchange="toggleTaskStatus('${t.id}', this.checked)"
                        title="${isCommander ? 'Toggle completion' : '🔒 Observer Mode (Read Only)'}"
                    />
                    <span class="task-hud-title">${escapeHtml(t.title)}</span>
                </div>
                <div class="task-hud-meta">
                    <span class="${t.priority >= 8 ? 'priority-pill-high' : 'priority-pill-med'}">${prioIcon} P${t.priority || 5}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleTaskStatus(taskId, isChecked) {
    if (!isCommander) {
        showToast("🔒 Observer Mode: Only verified Commander can update tasks.", "warning");
        openModal('modal-commander-login');
        renderTasks();
        return;
    }
    const newStatus = isChecked ? 'completed' : 'todo';
    try {
        const res = await authFetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.status === 403) {
            showToast("🔒 Observer Mode: Task update denied.", "warning");
            openModal('modal-commander-login');
            renderTasks();
            return;
        }
        const task = cachedTasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            renderTasks();
            if (isChecked) {
                appendMikasaChatMessage(`Task *"${task.title}"* marked complete! Well done, Swapnil.`);
            }
        }
    } catch (err) {
        console.error('Error toggling task:', err);
    }
}

// 2. Goals
async function loadGoals() {
    const container = document.getElementById('goals-container');
    try {
        const res = await fetch('/api/goals');
        const goals = await res.json();
        if (!goals || goals.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted);">No strategic goals found.</div>`;
            return;
        }

        container.innerHTML = goals.map(g => {
            const cat = (g.category || 'general').toLowerCase();
            let catClass = 'cat-general';
            if (cat.includes('career')) catClass = 'cat-career';
            else if (cat.includes('learn')) catClass = 'cat-learning';
            else if (cat.includes('entrepreneur')) catClass = 'cat-entrepreneurship';

            return `
                <div class="goal-card">
                    <div class="goal-meta">
                        <span class="category-badge ${catClass}">${escapeHtml(g.category || 'Strategic')}</span>
                        <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">Priority ${g.priority || 10}/10</span>
                    </div>
                    <div class="goal-title">${escapeHtml(g.title)}</div>
                    <div class="goal-progress-bar">
                        <div class="goal-progress-fill" style="width: ${Math.min(100, (g.priority || 5) * 10)}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="error-state">Error loading goals: ${err.message}</div>`;
    }
}

// 3. Decisions
async function loadDecisions() {
    const container = document.getElementById('decisions-container');
    try {
        const res = await fetch('/api/decisions');
        const decisions = await res.json();
        if (!decisions || decisions.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted);">No architectural decisions recorded yet.</div>`;
            return;
        }

        container.innerHTML = decisions.map(d => {
            return `
                <div class="decision-card">
                    <div class="decision-title">${escapeHtml(d.decision)}</div>
                    ${d.reason ? `<div class="decision-reason"><strong>Rationale:</strong> ${escapeHtml(d.reason)}</div>` : ''}
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">
                        Status: <span style="color: var(--emerald); font-weight: 600;">${d.status || 'Active'}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="error-state">Error loading decisions: ${err.message}</div>`;
    }
}

// 4. Memories
async function loadMemories() {
    const container = document.getElementById('memories-container');
    try {
        const res = await fetch('/api/memories');
        const memories = await res.json();
        if (!memories || memories.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted);">Memory vault is synchronizing...</div>`;
            return;
        }

        container.innerHTML = memories.map(m => {
            const stars = '★'.repeat(m.importance || 3);
            const typeBadge = (m.memory_type || 'FACT').toUpperCase();
            return `
                <div class="memory-item">
                    <div class="memory-top">
                        <span class="memory-type">${typeBadge}</span>
                        <span style="color: var(--amber); font-size: 0.75rem;">${stars}</span>
                    </div>
                    <div class="memory-content">${escapeHtml(m.content)}</div>
                    <div class="memory-date">${new Date(m.created_at).toLocaleDateString()}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="error-state">Error loading memories: ${err.message}</div>`;
    }
}

// 5. Projects
async function loadProjects() {
    const container = document.getElementById('projects-container');
    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        if (!projects || projects.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted);">No projects found.</div>`;
            return;
        }

        container.innerHTML = projects.map(p => {
            return `
                <div class="project-card">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <h4>${escapeHtml(p.name)}</h4>
                        <span class="project-tag">${p.status || 'active'}</span>
                    </div>
                    <div class="project-desc">${escapeHtml(p.description || 'Core engineering build for Swapnil.')}</div>
                    ${p.repository_url ? `
                        <div style="margin-top: 6px;">
                            <a href="${p.repository_url}" target="_blank" style="color: var(--cyan); font-size: 0.78rem; text-decoration: none;">
                                ↗ View Repository
                            </a>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="error-state">Error loading projects: ${err.message}</div>`;
    }
}

// 6. GitHub Radar
async function loadGitHub() {
    const container = document.getElementById('github-container');
    try {
        const res = await fetch('/api/github');
        const repos = await res.json();
        if (!repos || repos.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted);">No repositories found.</div>`;
            return;
        }

        container.innerHTML = repos.slice(0, 6).map(r => {
            return `
                <div class="project-card">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <h4>${escapeHtml(r.name)}</h4>
                        <span class="project-tag">${r.language || 'Code'}</span>
                    </div>
                    <div class="project-desc">${escapeHtml(r.description)}</div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                        <a href="${r.url}" target="_blank" style="color: var(--cyan); font-size: 0.78rem; text-decoration: none;">
                            ↗ GitHub (${r.stars} ★)
                        </a>
                        <button class="btn btn-secondary" style="font-size: 0.7rem; padding: 3px 8px;" onclick="draftLinkedInForRepo('${escapeHtml(r.name)}')">
                            💼 Draft Post
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="error-state">Error loading GitHub repos: ${err.message}</div>`;
    }
}

function draftLinkedInForRepo(repoName) {
    if (!isCommander) {
        showToast("🔒 Observer Mode: Post drafting is reserved for Commander Swapnil.", "warning");
        openModal('modal-commander-login');
        return;
    }
    const input = document.getElementById('linkedin-input-topic');
    if (input) {
        input.value = repoName;
        document.getElementById('form-linkedin-draft')?.dispatchEvent(new Event('submit'));
    }
}

// 7. Active Reminders
async function loadReminders() {
    const container = document.getElementById('reminders-container');
    try {
        const res = await fetch('/api/reminders');
        const list = await res.json();
        if (!list || list.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px 0;">No active reminders scheduled. Click "+ New Reminder" to set one.</div>`;
            return;
        }

        container.innerHTML = list.map(r => {
            const minsLeft = Math.max(1, Math.round((r.dueAt - Date.now()) / 60000));
            return `
                <div class="task-item" style="border-left: 3px solid var(--amber);">
                    <div class="task-left">
                        <span style="font-size: 1rem;">⏰</span>
                        <span class="task-title">${escapeHtml(r.text)}</span>
                    </div>
                    <div class="task-meta">
                        <span class="project-tag" style="color: var(--amber); border-color: rgba(245, 158, 11, 0.3);">
                            Due in ~${minsLeft}m
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="error-state">Error loading reminders: ${err.message}</div>`;
    }
}

// --- COPILOT HUB (LINKEDIN, CV, PROMPTS, SOCIALS) ---
function initCopilotHub() {
    // Refresh GitHub button
    document.getElementById('btn-refresh-github')?.addEventListener('click', loadGitHub);

    // Run AI Social Audit button (Allowed in read-only observer mode to showcase telemetry)
    document.getElementById('btn-run-social-audit')?.addEventListener('click', async () => {
        const details = document.getElementById('social-audit-details');
        details.innerHTML = '<div style="color: var(--cyan);">Analyzing online brand & verified profiles...</div>';
        try {
            const res = await fetch('/api/socials');
            const data = await res.json();
            details.innerHTML = `
                <div style="font-weight: 700; color: var(--emerald); margin-bottom: 6px;">⚡ Complete Ecosystem Strategy (${data.overview.identity}):</div>
                <div style="margin-bottom: 8px;">${escapeHtml(data.overview.summary)}</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                    <div style="background: rgba(0,0,0,0.4); padding: 8px; border-radius: 6px;">
                        <strong style="color: #60a5fa;">LinkedIn Action:</strong>
                        <div style="font-size: 0.76rem; color: #cbd5e1; margin-top: 3px;">${escapeHtml(data.platforms.linkedin.action_items[0])}</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.4); padding: 8px; border-radius: 6px;">
                        <strong style="color: #38bdf8;">X / Twitter Action:</strong>
                        <div style="font-size: 0.76rem; color: #cbd5e1; margin-top: 3px;">${escapeHtml(data.platforms.twitter.action_items[0])}</div>
                    </div>
                </div>
            `;
        } catch (err) {
            details.innerHTML = `<div style="color: var(--rose);">Error running audit: ${err.message}</div>`;
        }
    });

    // Quick draft buttons from Social Card
    document.getElementById('btn-quick-edu51-linkedin')?.addEventListener('click', () => {
        if (!isCommander) {
            showToast("🔒 Observer Mode: Post drafting is reserved for Commander Swapnil.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const input = document.getElementById('linkedin-input-topic');
        if (input) {
            input.value = 'Edu51Portal';
            document.getElementById('form-linkedin-draft')?.dispatchEvent(new Event('submit'));
        }
    });

    document.getElementById('btn-quick-edu51-twitter')?.addEventListener('click', async () => {
        if (!isCommander) {
            showToast("🔒 Observer Mode: X thread generation is reserved for Commander Swapnil.", "warning");
            openModal('modal-commander-login');
            return;
        }
        try {
            const res = await authFetch('/api/twitter/thread', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: 'Edu51Portal' })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Generation denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            const data = await res.json();
            const promptTitle = document.getElementById('prompt-result-type');
            const promptText = document.getElementById('prompt-result-text');
            const container = document.getElementById('prompt-result-container');
            if (promptTitle && promptText && container) {
                promptTitle.textContent = `X / Twitter Thread: ${data.title}`;
                promptText.textContent = data.tweets.join('\n\n');
                container.style.display = 'block';
                container.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) {
            alert('Error generating X thread: ' + err.message);
        }
    });

    // LinkedIn Draft Form
    document.getElementById('form-linkedin-draft')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: LinkedIn post generation is reserved for Commander Swapnil.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const topic = document.getElementById('linkedin-input-topic').value.trim();
        try {
            const res = await authFetch('/api/linkedin/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Generation denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            const data = await res.json();
            document.getElementById('linkedin-preview-title').textContent = data.title;
            document.getElementById('linkedin-preview-content').value = data.content;
            document.getElementById('linkedin-preview-container').style.display = 'block';
        } catch (err) {
            alert('Error generating post: ' + err.message);
        }
    });

    // Copy LinkedIn Post
    document.getElementById('btn-copy-linkedin')?.addEventListener('click', () => {
        const text = document.getElementById('linkedin-preview-content').value;
        navigator.clipboard.writeText(text);
        showToast("LinkedIn post copied to clipboard!", "success");
    });

    // CV Tailor Form
    document.getElementById('form-cv-tailor')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: CV tailoring is reserved for Commander Swapnil.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const role = document.getElementById('cv-input-role').value.trim();
        try {
            const res = await authFetch('/api/cv/tailor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_description: role })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Tailoring denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            const data = await res.json();
            document.getElementById('cv-matches-header').textContent = `Matched Projects: ${data.matched_projects.join(', ')}`;
            document.getElementById('cv-bullets-list').innerHTML = data.recommended_bullets.map(b => `<div style="margin-bottom: 8px;">${escapeHtml(b)}</div>`).join('');
            document.getElementById('cv-results-container').style.display = 'block';
        } catch (err) {
            alert('Error tailoring CV: ' + err.message);
        }
    });

    // Copy CV Bullets
    document.getElementById('btn-copy-cv')?.addEventListener('click', () => {
        const bullets = document.getElementById('cv-bullets-list').innerText;
        navigator.clipboard.writeText(bullets);
        showToast("Tailored CV bullet points copied to clipboard!", "success");
    });

    // Master Prompt Generator Form
    document.getElementById('form-prompt-gen')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: Prompt generation is reserved for Commander Swapnil.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const goal = document.getElementById('prompt-input-goal').value.trim();
        try {
            const res = await authFetch('/api/prompt/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal })
            });
            if (res.status === 403) {
                showToast("🔒 Observer Mode: Prompt generation denied.", "warning");
                openModal('modal-commander-login');
                return;
            }
            const data = await res.json();
            document.getElementById('prompt-result-type').textContent = data.type;
            document.getElementById('prompt-result-text').textContent = data.prompt;
            document.getElementById('prompt-result-container').style.display = 'block';
        } catch (err) {
            alert('Error generating prompt: ' + err.message);
        }
    });

    // Copy Prompt
    document.getElementById('btn-copy-prompt')?.addEventListener('click', () => {
        const text = document.getElementById('prompt-result-text').textContent;
        navigator.clipboard.writeText(text);
        showToast("Master prompt copied to clipboard!", "success");
    });

    // Live LinkedIn Jobs Radar (PATHS v2)
    document.getElementById('btn-refresh-linkedin-jobs')?.addEventListener('click', () => {
        const q = document.getElementById('input-job-query')?.value || 'Frontend Developer Next.js';
        const loc = document.getElementById('input-job-loc')?.value || 'Dhaka';
        loadLiveLinkedInJobs(q, loc);
    });

    document.getElementById('btn-search-linkedin-jobs')?.addEventListener('click', () => {
        const q = document.getElementById('input-job-query')?.value || 'Frontend Developer Next.js';
        const loc = document.getElementById('input-job-loc')?.value || 'Dhaka';
        loadLiveLinkedInJobs(q, loc);
    });

    document.getElementById('input-job-query')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = document.getElementById('input-job-query')?.value || 'Frontend Developer Next.js';
            const loc = document.getElementById('input-job-loc')?.value || 'Dhaka';
            loadLiveLinkedInJobs(q, loc);
        }
    });

    // Auto-load live LinkedIn jobs
    loadLiveLinkedInJobs();
}

// Global helper for 1-click tailoring from Job Card
window.tailorForJob = function(jobTitle) {
    const inputRole = document.getElementById('cv-input-role');
    if (inputRole) {
        inputRole.value = jobTitle;
        document.getElementById('form-cv-tailor')?.dispatchEvent(new Event('submit'));
        showToast(`🎯 Tailoring CV for: ${jobTitle}`, "info");
        document.getElementById('form-cv-tailor')?.scrollIntoView({ behavior: 'smooth' });
    }
};

async function loadLiveLinkedInJobs(query = 'Frontend Developer Next.js', loc = 'Dhaka') {
    const container = document.getElementById('linkedin-live-jobs-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-state">Scraping real-time openings on LinkedIn...</div>';
    try {
        const res = await fetch(`/api/career/jobs?q=${encodeURIComponent(query)}&loc=${encodeURIComponent(loc)}`);
        const data = await res.json();
        
        let html = '';
        if (data.live_jobs && data.live_jobs.length > 0) {
            html += data.live_jobs.map(j => `
                <div class="job-radar-hud-card">
                    <div>
                        <div class="job-title">${escapeHtml(j.title)}</div>
                        <div class="job-company">🏢 ${escapeHtml(j.company)}</div>
                        <div class="job-meta" style="margin-top: 6px;">
                            <span>📍 ${escapeHtml(j.location)}</span>
                            <span>⏱️ ${escapeHtml(j.posted)}</span>
                        </div>
                    </div>
                    <div class="job-actions" style="margin-top: 10px;">
                        <a href="${j.url}" target="_blank" rel="noopener noreferrer" class="btn-apply-linkedin">
                            🔗 Apply on LinkedIn
                        </a>
                        <button type="button" class="btn-tailor-cv-quick" onclick="window.tailorForJob('${escapeHtml(j.title.replace(/'/g, "\\'"))}')">
                            📄 Tailor CV
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            html += `<div style="text-align: center; color: #94a3b8; padding: 14px;">No live postings returned for "${escapeHtml(query)}" in "${escapeHtml(loc)}". Check the direct search feeds below.</div>`;
        }

        if (data.searches && data.searches.length > 0) {
            html += `
                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
                    <div style="font-size: 0.78rem; font-weight: 700; color: #38bdf8; margin-bottom: 8px;">🌐 Pre-Filtered Live Feeds (Open on LinkedIn):</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${data.searches.map(s => `
                            <a href="${s.url}" target="_blank" rel="noopener noreferrer" style="background: rgba(14, 165, 233, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 6px 10px; font-size: 0.75rem; color: #f1f5f9; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                                ${escapeHtml(s.title)}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div class="error-state">Failed to load LinkedIn jobs: ${escapeHtml(e.message)}</div>`;
    }
}

// --- LIVE COMPANION TERMINAL (MIKASA CHAT) ---
function initChat() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const chips = document.querySelectorAll('.chip, .hud-chip-btn');

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isCommander) {
            showToast("🔒 Observer Mode: Live commands are reserved for Commander Swapnil.", "warning");
            openModal('modal-commander-login');
            return;
        }
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        await sendMessageToMikasa(text);
    });

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            if (!isCommander) {
                showToast("🔒 Observer Mode: Direct commands are reserved for Commander Swapnil.", "warning");
                openModal('modal-commander-login');
                return;
            }
            const query = chip.getAttribute('data-query');
            if (query) {
                sendMessageToMikasa(query);
            }
        });
    });
}

async function sendMessageToMikasa(text, isSpoken = false) {
    const messagesContainer = document.getElementById('chat-messages-container');

    // 1. Append User Bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble-hud bubble-swapnil';
    userBubble.textContent = text;
    messagesContainer.appendChild(userBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 2. Append Typing Indicator
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble-hud bubble-mikasa';
    typingBubble.id = 'chat-typing-indicator';
    typingBubble.innerHTML = `
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    messagesContainer.appendChild(typingBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
        const res = await authFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                conversation_id: 'commander_session'
            })
        });

        if (res.status === 403) {
            typingBubble.remove();
            appendMikasaChatMessage("🔒 *Public Observer Mode.* Direct command dispatch and state alterations are reserved for Commander Swapnil. You are observing Mikasa's live telemetry and performance.");
            showToast("🔒 Observer Mode: Only verified Commander can dispatch commands.", "warning");
            return null;
        }

        const data = await res.json();
        typingBubble.remove();

        let reply = data.reply || 'I am here with you, Swapnil.';
        if (data.actionResult && data.actionResult.feedback && !reply.includes(data.actionResult.feedback)) {
            reply += `\n\n⚡ *[Action Executed]*: ${data.actionResult.feedback}`;
        }
        appendMikasaChatMessage(reply);
        loadQuotaTelemetry();

        // Speak reply automatically if triggered by voice and audio synthesis is active
        if (speechSynthEnabled && isSpoken) {
            playCuteFemaleVoice(reply);
        }

        // If intent opened a browser URL, open tab directly in active browser
        if (data.actionResult && data.actionResult.action === 'browser_opened' && data.actionResult.url) {
            try {
                window.open(data.actionResult.url, '_blank');
            } catch (e) {
                console.warn('[Client Window Open Error]:', e);
            }
        }

        // If intent launched a desktop application, show confirmation toast
        if (data.actionResult && data.actionResult.action === 'app_launched') {
            showToast(data.actionResult.feedback || `Launched ${data.actionResult.app} on desktop`, "success");
        }

        // Auto-refresh memories and tasks silently
        setTimeout(() => {
            loadMemories();
            loadTasks();
            loadReminders();
            loadQuotaTelemetry();
        }, 1500);

        return reply;

    } catch (err) {
        typingBubble.remove();
        appendMikasaChatMessage(`⚠️ Could not reach neural core: ${err.message}`);
        return null;
    }
}

function appendMikasaChatMessage(text) {
    const messagesContainer = document.getElementById('chat-messages-container');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble-hud bubble-mikasa';
    bubble.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <img src="/Mikasa-logo.jpeg" alt="Mikasa" class="companion-avatar" style="width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; object-fit: cover;">
            <div style="flex: 1; line-height: 1.5;">${formatMarkdown(text)}</div>
            <button class="btn-bubble-speak" title="Hear Mikasa speak (Cute Female Voice)" style="background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; padding: 2px 5px; font-size: 14px; border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.color='#00ffcc'; this.style.background='rgba(0,255,204,0.1)'" onmouseout="this.style.color='rgba(255,255,255,0.4)'; this.style.background='none'">
                🔊
            </button>
        </div>
    `;
    const btnSpeak = bubble.querySelector('.btn-bubble-speak');
    if (btnSpeak) {
        btnSpeak.addEventListener('click', (e) => {
            e.stopPropagation();
            playCuteFemaleVoice(text);
        });
    }
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Clean markdown formatter for bubbles
function formatMarkdown(text) {
    if (!text) return '';
    let out = escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>')
        .replace(/\n/g, '<br>');
    return out;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── PATHS V2: JARVIS & LOCAL PC CONTROL HUB ──
let speechSynthEnabled = true;
let isVoiceListening = false;
let speechRecognitionInstance = null;

function initPCHub() {
    // 1. Refresh buttons
    const btnRefreshStatus = document.getElementById('btn-refresh-pc-status');
    if (btnRefreshStatus) btnRefreshStatus.addEventListener('click', loadPCTelemetry);

    const btnRefreshMonitors = document.getElementById('btn-refresh-monitors');
    if (btnRefreshMonitors) btnRefreshMonitors.addEventListener('click', loadServiceMonitors);

    // 2. Toggle Voice Audio Synthesis
    const btnToggleVoice = document.getElementById('btn-toggle-voice-synth');
    const labelVoiceStatus = document.getElementById('label-voice-synth-status');
    if (btnToggleVoice) {
        btnToggleVoice.addEventListener('click', () => {
            speechSynthEnabled = !speechSynthEnabled;
            if (labelVoiceStatus) labelVoiceStatus.textContent = speechSynthEnabled ? 'ON' : 'OFF';
            showToast(`Voice audio synthesis ${speechSynthEnabled ? 'enabled' : 'muted'}`, 'info');
        });
    }

    // 3. JARVIS Voice Recognition
    initJarvisVoice();

    // 4. Mode Buttons
    const modeBtns = document.querySelectorAll('.btn-mode');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.getAttribute('data-mode');
            if (!isCommander) {
                showToast("🔒 Switching agent modes requires verified Commander authentication.", "warning");
                return;
            }
            try {
                const res = await authFetch('/api/pc/modes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode })
                });
                const data = await res.json();
                if (data.success) {
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const badge = document.getElementById('current-mode-badge');
                    if (badge) badge.textContent = `Active: ${data.mode} Mode`;
                    showToast(`Agent mode switched to: ${data.mode}`, 'success');
                }
            } catch (e) {
                showToast("Failed to switch mode: " + e.message, "warning");
            }
        });
    });

    // 5. Privacy Toggles
    const privacyToggles = document.querySelectorAll('.privacy-toggle');
    privacyToggles.forEach(toggle => {
        toggle.addEventListener('click', async () => {
            const perm = toggle.getAttribute('data-perm');
            if (!isCommander) {
                showToast("🔒 Updating security/privacy matrix requires Commander passkey.", "warning");
                return;
            }
            const currentVal = toggle.classList.contains('active');
            let nextVal = !currentVal;
            if (perm === 'terminal') {
                nextVal = toggle.textContent === 'RESTRICTED' ? 'disabled' : 'restricted';
            }
            try {
                const res = await authFetch('/api/pc/privacy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [perm]: nextVal })
                });
                const updated = await res.json();
                renderPrivacyControls(updated);
                showToast(`Updated ${perm} policy: ${nextVal}`, 'info');
            } catch (e) {
                showToast("Failed to update privacy policy", "warning");
            }
        });
    });

    // 6. Allowed File Search
    const btnSearchFiles = document.getElementById('btn-search-files');
    const inputSearchFiles = document.getElementById('input-search-files');
    if (btnSearchFiles && inputSearchFiles) {
        btnSearchFiles.addEventListener('click', () => runFileSearch(inputSearchFiles.value));
        inputSearchFiles.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runFileSearch(inputSearchFiles.value);
        });
    }

    // 7. Controlled Terminal Execution
    const btnRunTerminal = document.getElementById('btn-run-terminal');
    const inputTerminalCmd = document.getElementById('input-terminal-cmd');
    if (btnRunTerminal && inputTerminalCmd) {
        btnRunTerminal.addEventListener('click', () => runControlledTerminal(inputTerminalCmd.value));
        inputTerminalCmd.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runControlledTerminal(inputTerminalCmd.value);
        });
    }

    // 8. Quick Launch Dock Actions (Browser & Desktop Apps)
    const dockTiles = document.querySelectorAll('.dock-tile-btn[data-action]');
    dockTiles.forEach(tile => {
        tile.addEventListener('click', async (e) => {
            e.preventDefault();
            const action = tile.getAttribute('data-action');
            if (!isCommander) {
                showToast("🔒 Quick Launch PC actions require verified Commander passkey.", "warning");
                openModal('modal-commander-login');
                return;
            }

            try {
                if (action === 'open-youtube') {
                    showToast("🔴 Opening YouTube in browser...", "info");
                    window.open('https://www.youtube.com', '_blank');
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: 'https://www.youtube.com' })
                    });
                    const d = await res.json();
                    showToast(d.message || "YouTube launched", "success");
                } else if (action === 'open-github') {
                    showToast("🐙 Opening GitHub Swapnil-360...", "info");
                    window.open('https://github.com/Swapnil-360', '_blank');
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: 'https://github.com/Swapnil-360' })
                    });
                    const d = await res.json();
                    showToast(d.message || "GitHub opened", "success");
                } else if (action === 'launch-vscode') {
                    showToast("💻 Launching VS Code on local PC...", "info");
                    const res = await authFetch('/api/pc/app/launch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ app: 'vscode' })
                    });
                    const d = await res.json();
                    showToast(d.message || "VS Code launched", "success");
                } else if (action === 'launch-terminal') {
                    showToast("⚡ Launching PowerShell Terminal...", "info");
                    const res = await authFetch('/api/pc/app/launch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ app: 'terminal' })
                    });
                    const d = await res.json();
                    showToast(d.message || "Terminal launched", "success");
                } else if (action === 'open-google') {
                    window.open('https://www.google.com', '_blank');
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: 'https://www.google.com' })
                    });
                    const d = await res.json();
                    showToast(d.message || "Google opened", "success");
                } else if (action === 'open-linkedin') {
                    window.open('https://www.linkedin.com/in/mr-swapnil/', '_blank');
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: 'https://www.linkedin.com/in/mr-swapnil/' })
                    });
                    const d = await res.json();
                    showToast(d.message || "LinkedIn opened", "success");
                } else if (action === 'open-portfolio') {
                    window.open('https://www.mrswapnil.me', '_blank');
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: 'https://www.mrswapnil.me' })
                    });
                    const d = await res.json();
                    showToast(d.message || "Portfolio opened", "success");
                } else if (action === 'open-n8n') {
                    window.open('http://localhost:5678', '_blank');
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: 'http://localhost:5678' })
                    });
                    const d = await res.json();
                    showToast(d.message || "n8n Studio opened", "success");
                } else if (action === 'open-projects-folder') {
                    showToast("📁 Opening D:\\Projects in Windows Explorer...", "info");
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder: 'D:\\Projects' })
                    });
                    const d = await res.json();
                    showToast(d.message || "Folder opened", "success");
                } else if (action === 'open-swapnil-folder') {
                    showToast("📁 Opening D:\\Swapnil in Windows Explorer...", "info");
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder: 'D:\\Swapnil' })
                    });
                    const d = await res.json();
                    showToast(d.message || "Folder opened", "success");
                } else if (action === 'open-discord') {
                    showToast("🟣 Opening Discord...", "info");
                    window.open('https://discord.com/app', '_blank');
                    const res = await authFetch('/api/pc/browser/open', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: 'https://discord.com/app' })
                    });
                    const d = await res.json();
                    showToast(d.message || "Discord launched", "success");
                } else if (action === 'open-crypto-sourcing') {
                    showToast("💎 Querying live Web3 & Crypto Radar...", "info");
                    await sendMessageToMikasa("Find newly listed crypto projects and tokens");
                }
            } catch (err) {
                showToast("Action error: " + err.message, "warning");
            }
        });
    });

    // 9. Quick Search Launcher Bar
    const inputQuickSearch = document.getElementById('input-quick-search');
    const btnQuickGoogle = document.getElementById('btn-quick-google');
    const btnQuickYoutube = document.getElementById('btn-quick-youtube');

    async function triggerQuickSearch(engine = 'google') {
        const query = (inputQuickSearch?.value || '').trim();
        if (!query) {
            showToast("Please enter search terms first", "info");
            return;
        }
        const url = engine === 'youtube'
            ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
            : `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        try {
            showToast(`Opening ${engine === 'youtube' ? 'YouTube' : 'Google'} for "${query}"...`, "info");
            window.open(url, '_blank');
            const res = await authFetch('/api/pc/browser/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const d = await res.json();
            showToast(d.message || "Search opened in browser", "success");
        } catch (e) {
            showToast("Search launch error: " + e.message, "warning");
        }
    }

    if (btnQuickGoogle) btnQuickGoogle.addEventListener('click', () => triggerQuickSearch('google'));
    if (btnQuickYoutube) btnQuickYoutube.addEventListener('click', () => triggerQuickSearch('youtube'));
    if (inputQuickSearch) {
        inputQuickSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') triggerQuickSearch('google');
        });
    }

    // Initial Telemetry & Monitors Load
    loadPCTelemetry();
    loadServiceMonitors();
    // Poll PC telemetry every 15s
    setInterval(loadPCTelemetry, 15000);
}

function initJarvisVoice() {
    const btnVoice = document.getElementById('btn-jarvis-voice');
    const btnChatMic = document.getElementById('btn-chat-mic');
    const btnHeaderVoice = document.getElementById('btn-header-voice');
    const btnChatHeaderVoice = document.getElementById('btn-chat-header-voice');
    const labelHeaderVoice = document.getElementById('label-header-voice');
    const voiceLabel = document.getElementById('voice-label');
    const voiceFeedback = document.getElementById('voice-feedback');
    const btnArcReactor = document.getElementById('btn-arc-reactor');
    const reactorRingsWrapper = document.getElementById('reactor-rings-wrapper');
    const visualizerBars = document.getElementById('audio-visualizer-bars');
    const reactorStatusText = document.getElementById('reactor-status-text');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    const allVoiceBtns = [btnVoice, btnChatMic, btnHeaderVoice, btnChatHeaderVoice, btnArcReactor, reactorRingsWrapper].filter(Boolean);

    if (!SpeechRecognition) {
        if (voiceFeedback) voiceFeedback.textContent = "Web Speech API not supported in this browser. Use chat input.";
        allVoiceBtns.forEach(btn => {
            btn.title = "Web Speech not supported in this browser";
        });
        return;
    }

    speechRecognitionInstance = new SpeechRecognition();
    speechRecognitionInstance.continuous = false;
    speechRecognitionInstance.interimResults = true;
    speechRecognitionInstance.lang = 'en-US';

    speechRecognitionInstance.onstart = () => {
        isVoiceListening = true;
        allVoiceBtns.forEach(btn => btn.classList.add('listening'));
        if (reactorRingsWrapper) reactorRingsWrapper.classList.add('listening');
        if (visualizerBars) visualizerBars.classList.add('speaking');
        if (reactorStatusText) reactorStatusText.textContent = "LISTENING...";
        if (labelHeaderVoice) labelHeaderVoice.textContent = "Listening...";
        if (voiceLabel) voiceLabel.textContent = "Listening... Speak now";
        if (voiceFeedback) voiceFeedback.textContent = "Mikasa is listening to your microphone...";
    };

    speechRecognitionInstance.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        if (voiceFeedback) voiceFeedback.textContent = `"${transcript}"`;

        if (event.results[0].isFinal) {
            handleVoiceCommand(transcript);
        }
    };

    speechRecognitionInstance.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        isVoiceListening = false;
        allVoiceBtns.forEach(btn => btn.classList.remove('listening'));
        if (reactorRingsWrapper) reactorRingsWrapper.classList.remove('listening');
        if (visualizerBars) visualizerBars.classList.remove('speaking');
        if (reactorStatusText) reactorStatusText.textContent = "SPEAK [V]";
        if (labelHeaderVoice) labelHeaderVoice.textContent = "Voice Mode";
        if (voiceLabel) voiceLabel.textContent = 'Speak Command ("Hey Mikasa...")';
        if (voiceFeedback) voiceFeedback.textContent = `Voice recognition notice: ${event.error}. Click to retry.`;
    };

    speechRecognitionInstance.onend = () => {
        isVoiceListening = false;
        allVoiceBtns.forEach(btn => btn.classList.remove('listening'));
        if (reactorRingsWrapper) reactorRingsWrapper.classList.remove('listening');
        if (visualizerBars) visualizerBars.classList.remove('speaking');
        if (reactorStatusText) reactorStatusText.textContent = "SPEAK [V]";
        if (labelHeaderVoice) labelHeaderVoice.textContent = "Voice Mode";
        if (voiceLabel) voiceLabel.textContent = 'Speak Command ("Hey Mikasa...")';
    };

    function toggleVoice() {
        if (isVoiceListening) {
            speechRecognitionInstance.stop();
        } else {
            try {
                speechRecognitionInstance.start();
                showToast("🎙️ Listening... Speak your command to Mikasa", "info");
            } catch (e) {
                console.warn(e);
            }
        }
    }

    allVoiceBtns.forEach(btn => btn.addEventListener('click', toggleVoice));

    // Global keyboard shortcut: Press 'v' or 'V' to toggle voice (when not in input)
    window.addEventListener('keydown', (e) => {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
            return;
        }
        if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            toggleVoice();
        }
    });
}

// ── CUTE FEMALE VOICE SYNTHESIS (GEMINI NATIVE "KORE" + FEMALE BROWSER FALLBACK) ──
let activeAudioPlayer = null;

// Preload browser voices for fallback
if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        try { window.speechSynthesis.getVoices(); } catch (e) {}
    };
}

async function handleVoiceCommand(spokenText) {
    if (!spokenText || !spokenText.trim()) return;
    const voiceFeedback = document.getElementById('voice-feedback');
    if (voiceFeedback) voiceFeedback.textContent = `Processing: "${spokenText}"...`;

    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.value = spokenText;

    const reply = await sendMessageToMikasa(spokenText, true);
    if (voiceFeedback && reply) {
        voiceFeedback.textContent = `Mikasa: "${reply.slice(0, 50)}..."`;
    }
}

function stripVoiceText(text) {
    if (!text) return '';
    return text
        .replace(/[\p{Extended_Pictographic}\u200d\ufe0f\u203c-\u3299\u{1f000}-\u{1f9ff}]/gu, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_#`~\[\]\(\)\{\}\<\>\\\/|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function playCuteFemaleVoice(text) {
    if (!text || !text.trim() || !speechSynthEnabled) return;

    // Stop any ongoing audio or speech
    if (activeAudioPlayer) {
        try {
            activeAudioPlayer.pause();
            activeAudioPlayer.currentTime = 0;
        } catch (e) {}
        activeAudioPlayer = null;
    }
    if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    const visualizerBars = document.getElementById('audio-visualizer-bars');
    const cleanVoiceText = stripVoiceText(text).slice(0, 320);

    if (!cleanVoiceText) return;

    if (visualizerBars) visualizerBars.classList.add('speaking');

    // 1. Primary: Gemini Native Cute Female Voice ("Kore" model on Gemini 3.8 Flash Lite)
    const audioUrl = `/api/voice/tts?text=${encodeURIComponent(cleanVoiceText)}`;
    const audio = new Audio(audioUrl);
    activeAudioPlayer = audio;

    audio.onplay = () => {
        if (visualizerBars) visualizerBars.classList.add('speaking');
    };
    audio.onended = () => {
        if (visualizerBars) visualizerBars.classList.remove('speaking');
        if (activeAudioPlayer === audio) activeAudioPlayer = null;
    };
    audio.onerror = (err) => {
        console.warn('[Gemini TTS Unavailable -> Switching to Browser Cute Female Fallback]:', err);
        if (visualizerBars) visualizerBars.classList.remove('speaking');
        fallbackBrowserFemaleVoice(cleanVoiceText);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch((e) => {
            console.warn('[Autoplay policy or network error -> Browser Voice Fallback]:', e);
            fallbackBrowserFemaleVoice(cleanVoiceText);
        });
    }
}

async function fallbackBrowserFemaleVoice(cleanText) {
    if (!window.speechSynthesis) return;
    const visualizerBars = document.getElementById('audio-visualizer-bars');

    let textToSpeak = stripVoiceText(cleanText);
    const hasBanglish = /\b(?:ami|tumi|apni|amake|tomake|amar|tomar|kemon|acho|achen|achhen|ache|ase|shob|sob|ekhane|koro|korcho|korchi|kora|korba|korben|korecho|korar|bolo|bolte|bolchi|bolba|parbo|parbe|hobe|khete|dekho|dekhbo|shunba|shunar|shunte|jonno|bhalo|valo|kharap|khobor|obostha|obsta|chaile|shamil|eita|eta|eti|ota|oita|kalke|agamikal|rate|shokal|ekhon|ekhankar|tai|ki|baire|ber|howar|howa|thanda|mathay|lagbe|naki|darun|bepar|boshe|bose|thako|shune|ar|aar|o|oi|kon|keno|kivabe|kibhabe|koi|jabo|jacchi|gecho|gechi|ashbo|asho|dhaka|dhakar)\b/i.test(textToSpeak) || /[\u0980-\u09FF]/.test(textToSpeak) || /[a-z]+-(?:r|e|te|er)\b/i.test(textToSpeak);

    if (hasBanglish) {
        try {
            const trRes = await fetch(`/api/voice/to-english?text=${encodeURIComponent(textToSpeak)}`);
            const trData = await trRes.json();
            if (trData && trData.english) {
                textToSpeak = stripVoiceText(trData.english);
            }
        } catch (e) {}
    }

    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.02;
        utterance.pitch = 1.28; // Cute, feminine anime tone (high pitch, soft)

        const voices = window.speechSynthesis.getVoices() || [];
        
        // Priority 1: Known cute / sweet female voices
        let femaleVoice = voices.find(v => {
            const n = (v.name || '').toLowerCase();
            return (n.includes('zira') || n.includes('jenny') || n.includes('aria') || 
                    n.includes('samantha') || n.includes('victoria') || n.includes('female') || 
                    n.includes('natural') || n.includes('google us english') || 
                    n.includes('google uk english female')) &&
                   !n.includes('david') && !n.includes('mark') && !n.includes('male') && 
                   !n.includes('george') && !n.includes('guy');
        });

        // Priority 2: Any non-male voice
        if (!femaleVoice) {
            femaleVoice = voices.find(v => {
                const n = (v.name || '').toLowerCase();
                return !n.includes('david') && !n.includes('male') && !n.includes('mark') && 
                       !n.includes('george') && !n.includes('richard');
            });
        }

        if (femaleVoice) {
            utterance.voice = femaleVoice;
        }

        if (visualizerBars) visualizerBars.classList.add('speaking');
        utterance.onend = () => {
            if (visualizerBars) visualizerBars.classList.remove('speaking');
        };
        utterance.onerror = () => {
            if (visualizerBars) visualizerBars.classList.remove('speaking');
        };

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('[Browser voice fallback error]:', e);
        if (visualizerBars) visualizerBars.classList.remove('speaking');
    }
}

async function loadPCTelemetry() {
    try {
        const res = await fetch('/api/pc/status');
        const data = await res.json();
        if (!data || !data.hostname) return;

        // Header status pills
        const textPc = document.getElementById('text-pc');
        if (textPc) textPc.textContent = `PC: ${data.hostname} (Online)`;

        const textN8n = document.getElementById('text-n8n');
        if (textN8n) textN8n.textContent = `n8n: :${data.n8n.port} (${data.n8n.running ? 'Running' : 'Offline'})`;

        const dotN8n = document.getElementById('dot-n8n');
        if (dotN8n) {
            dotN8n.style.background = data.n8n.running ? '#10b981' : '#f87171';
            dotN8n.style.boxShadow = data.n8n.running ? '0 0 8px #10b981' : '0 0 8px #f87171';
        }

        // Telemetry cards
        const tagHost = document.getElementById('pc-hostname-tag');
        if (tagHost) tagHost.textContent = `${data.hostname} (${data.platform})`;

        const gaugeCpuLoad = document.getElementById('gauge-cpu-load');
        const gaugeCpuModel = document.getElementById('gauge-cpu-model');
        const barCpuLoad = document.getElementById('bar-cpu-load');
        if (gaugeCpuLoad) gaugeCpuLoad.textContent = `${data.cpu.loadPct}%`;
        if (gaugeCpuModel) gaugeCpuModel.textContent = `${data.cpu.model.trim()} (${data.cpu.cores} Cores)`;
        if (barCpuLoad) barCpuLoad.style.width = `${Math.min(100, data.cpu.loadPct)}%`;

        const gaugeRamPct = document.getElementById('gauge-ram-pct');
        const gaugeRamDetails = document.getElementById('gauge-ram-details');
        const barRamLoad = document.getElementById('bar-ram-load');
        if (gaugeRamPct) gaugeRamPct.textContent = `${data.memory.usagePct}%`;
        if (gaugeRamDetails) gaugeRamDetails.textContent = `${data.memory.usedGb} GB / ${data.memory.totalGb} GB (${data.memory.freeGb} GB free)`;
        if (barRamLoad) barRamLoad.style.width = `${Math.min(100, parseFloat(data.memory.usagePct))}%`;

        const gaugeUptime = document.getElementById('gauge-uptime');
        if (gaugeUptime) gaugeUptime.textContent = `Uptime: ${data.uptimeFormatted}`;

        const disksContainer = document.getElementById('gauge-disks-list');
        if (disksContainer && data.disks) {
            disksContainer.innerHTML = data.disks.map(d => {
                const freePct = parseFloat(d.freePct);
                const usedPct = Math.max(0, Math.min(100, 100 - freePct));
                const statusColor = freePct < 15 ? '#f87171' : '#34d399';
                return `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 7px 10px; margin-bottom: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <span style="font-weight: 700; color: #f1f5f9; font-size: 0.74rem;">Drive ${escapeHtml(d.drive)} <span style="font-size: 0.68rem; color: #94a3b8; font-weight: normal;">(${escapeHtml(String(d.totalGb))} GB)</span></span>
                        <span style="color: ${statusColor}; font-weight: 700; font-size: 0.72rem;">${escapeHtml(String(d.freeGb))} GB free (${escapeHtml(String(d.freePct))}%)</span>
                    </div>
                    <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden;">
                        <div style="width: ${usedPct}%; height: 100%; background: ${freePct < 15 ? 'linear-gradient(90deg, #ef4444, #f87171)' : 'linear-gradient(90deg, #0284c7, #00f2fe)'}; border-radius: 999px;"></div>
                    </div>
                </div>
            `;
            }).join('');
        }

        const badgeN8nLive = document.getElementById('badge-n8n-live');
        if (badgeN8nLive) {
            badgeN8nLive.textContent = data.n8n.running ? '● RUNNING' : '○ OFFLINE';
            badgeN8nLive.style.color = data.n8n.running ? '#34d399' : '#f87171';
        }

        // Mode badge & Privacy controls
        const modeBadge = document.getElementById('current-mode-badge');
        if (modeBadge && data.mode) modeBadge.textContent = `Active: ${data.mode} Mode`;

        if (data.privacy) renderPrivacyControls(data.privacy);

    } catch (e) {
        console.warn('Failed to load PC telemetry:', e);
    }
}

function renderPrivacyControls(privacy) {
    for (const [key, val] of Object.entries(privacy)) {
        const toggle = document.getElementById(`toggle-${key}`);
        if (!toggle) continue;
        if (key === 'terminal') {
            toggle.textContent = val.toUpperCase();
            toggle.className = `privacy-toggle ${val === 'restricted' ? 'restricted' : (val === 'disabled' ? '' : 'active')}`;
        } else {
            toggle.textContent = val ? 'ON' : 'OFF';
            toggle.className = `privacy-toggle ${val ? 'active' : ''}`;
        }
    }
}

async function runFileSearch(query) {
    const container = document.getElementById('files-results-container');
    if (!container) return;
    container.innerHTML = '<div style="padding: 12px; text-align: center; color: #94a3b8;">Searching allowed directories...</div>';
    try {
        const res = await fetch(`/api/pc/files?q=${encodeURIComponent(query || '')}`);
        const data = await res.json();
        if (!data.files || data.files.length === 0) {
            container.innerHTML = '<div style="padding: 12px; text-align: center; color: #94a3b8;">No matching files found in allowed directories.</div>';
            return;
        }
        container.innerHTML = data.files.map(f => `
            <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600; color: #f1f5f9; font-size: 0.85rem;">📄 ${escapeHtml(f.name)}</div>
                    <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">${escapeHtml(f.path)} • ${f.sizeFormatted} • Modified: ${new Date(f.modifiedAt).toLocaleDateString()}</div>
                </div>
                <div style="font-size: 0.75rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 3px 8px; border-radius: 4px;">
                    Allowed
                </div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = `<div style="padding: 12px; color: #f87171;">Search error: ${escapeHtml(e.message)}</div>`;
    }
}

async function runControlledTerminal(cmd) {
    const consoleEl = document.getElementById('terminal-output-console');
    if (!consoleEl) return;
    if (!isCommander) {
        showToast("🔒 Controlled Terminal requires verified Commander authentication.", "warning");
        return;
    }
    consoleEl.textContent = `[Executing]: ${cmd}\nPermission check & security filtering in progress...\n`;
    try {
        const res = await authFetch('/api/pc/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, confirmed: false })
        });
        const data = await res.json();
        if (data.status === 'confirmation_required') {
            consoleEl.textContent = `⚠️ CONFIRMATION REQUIRED (${data.permission_level})\n${data.message}`;
            showToast("Command requires confirmation", "warning");
        } else {
            consoleEl.textContent = `⚡ [COMPLETED - Level: ${data.permission_level}] Duration: ${data.duration_ms}ms | Exit: ${data.exit_code}\n\n${data.output}`;
        }
    } catch (e) {
        consoleEl.textContent = `❌ Execution Error: ${e.message}`;
    }
}

async function loadServiceMonitors() {
    const grid = document.getElementById('monitors-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="padding: 16px; text-align: center; color: #94a3b8; grid-column: 1/-1;">Pinging monitored services...</div>';
    try {
        const res = await fetch('/api/pc/monitors');
        const list = await res.json();
        grid.innerHTML = list.map(m => {
            const isUp = m.status === 'UP';
            const color = isUp ? '#34d399' : (m.status === 'DEGRADED' ? '#fbbf24' : '#f87171');
            const beaconClass = isUp ? 'green' : (m.status === 'DEGRADED' ? 'amber' : 'red');
            const latencyColor = m.latencyMs < 50 ? '#34d399' : (m.latencyMs < 200 ? '#38bdf8' : '#fbbf24');
            return `
                <div style="background: linear-gradient(145deg, rgba(14, 22, 38, 0.65) 0%, rgba(8, 14, 26, 0.85) 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 0.84rem; font-weight: 700; color: #f1f5f9; font-family: var(--font-heading);">${escapeHtml(m.name)}</span>
                            <span style="font-size: 0.68rem; font-weight: 700; color: ${color}; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 2px 7px; border-radius: 999px; display: inline-flex; align-items: center; gap: 5px;">
                                <span class="pulse-beacon ${beaconClass}"></span> ${escapeHtml(m.status)}
                            </span>
                        </div>
                        <div style="font-size: 0.72rem; color: #94a3b8; word-break: break-all; font-family: var(--font-mono);">${escapeHtml(m.url)}</div>
                    </div>
                    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #cbd5e1; font-family: var(--font-mono);">
                        <span>Latency: <strong style="color: ${latencyColor};">${m.latencyMs}ms</strong></span>
                        <span style="color: ${m.ssl === 'VALID' ? '#34d399' : '#94a3b8'};">🔒 ${escapeHtml(m.ssl)}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        grid.innerHTML = `<div style="padding: 12px; color: #f87171; grid-column: 1/-1;">Monitoring error: ${escapeHtml(e.message)}</div>`;
    }
}

// Quick Terminal Command Chips delegation
document.addEventListener('click', (e) => {
    const chip = e.target.closest('.term-chip');
    if (chip) {
        const cmd = chip.getAttribute('data-cmd');
        const input = document.getElementById('input-terminal-cmd');
        if (input && cmd) {
            input.value = cmd;
            runControlledTerminal(cmd);
        }
    }
});

