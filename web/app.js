// MIKASA COMMAND CENTER — CLIENT LOGIC & REAL-TIME INTERACTION

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initModals();
    initFilters();
    initChat();
    initCopilotHub();

    // Initial Data Fetch
    loadTasks();
    loadGoals();
    loadDecisions();
    loadMemories();
    loadProjects();
    loadGitHub();
    loadReminders();
});

// --- TAB SWITCHING ---
function initTabs() {
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
    // Open triggers
    document.getElementById('btn-open-task-modal')?.addEventListener('click', () => openModal('modal-task'));
    document.getElementById('btn-open-goal-modal')?.addEventListener('click', () => openModal('modal-goal'));
    document.getElementById('btn-open-decision-modal')?.addEventListener('click', () => openModal('modal-decision'));
    document.getElementById('btn-open-remind-modal')?.addEventListener('click', () => openModal('modal-reminder'));
    document.getElementById('btn-open-remind-modal-2')?.addEventListener('click', () => openModal('modal-reminder'));

    // Clear Chat Button
    document.getElementById('btn-clear-chat')?.addEventListener('click', async () => {
        if (confirm('Clear chat history for this session?')) {
            try {
                await fetch('/api/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversation_id: 'commander_session' })
                });
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
    });

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
        const title = document.getElementById('task-input-title').value.trim();
        const projectHint = document.getElementById('task-select-project').value;
        const priority = parseInt(document.getElementById('task-input-priority').value) || 5;

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, project_hint: projectHint, priority })
            });
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
        const text = document.getElementById('reminder-input-text').value.trim();
        const timeStr = document.getElementById('reminder-input-time').value.trim();

        try {
            const res = await fetch('/api/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, time_str: timeStr })
            });
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
        const title = document.getElementById('goal-input-title').value.trim();
        const category = document.getElementById('goal-select-category').value;

        try {
            const res = await fetch('/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, category })
            });
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
        const decision = document.getElementById('decision-input-text').value.trim();
        const reason = document.getElementById('decision-input-reason').value.trim();
        const projectHint = document.getElementById('decision-select-project').value;

        try {
            const res = await fetch('/api/decisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, reason, project_hint: projectHint })
            });
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
            <div class="task-item ${isCompleted ? 'completed' : ''}" id="task-item-${t.id}">
                <div class="task-left">
                    <input 
                        type="checkbox" 
                        class="task-checkbox" 
                        ${isCompleted ? 'checked' : ''} 
                        onchange="toggleTaskStatus('${t.id}', this.checked)"
                        title="Toggle completion"
                    />
                    <span class="task-title">${escapeHtml(t.title)}</span>
                </div>
                <div class="task-meta">
                    <span class="prio-badge">${prioIcon} P${t.priority || 5}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleTaskStatus(taskId, isChecked) {
    const newStatus = isChecked ? 'completed' : 'todo';
    try {
        await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
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

    // Run AI Social Audit button
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
        const input = document.getElementById('linkedin-input-topic');
        if (input) {
            input.value = 'Edu51Portal';
            document.getElementById('form-linkedin-draft')?.dispatchEvent(new Event('submit'));
        }
    });

    document.getElementById('btn-quick-edu51-twitter')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/twitter/thread', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: 'Edu51Portal' })
            });
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
        const topic = document.getElementById('linkedin-input-topic').value.trim();
        try {
            const res = await fetch('/api/linkedin/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });
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
        alert('LinkedIn post copied to clipboard!');
    });

    // CV Tailor Form
    document.getElementById('form-cv-tailor')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const role = document.getElementById('cv-input-role').value.trim();
        try {
            const res = await fetch('/api/cv/tailor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_description: role })
            });
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
        alert('Tailored CV bullet points copied to clipboard!');
    });

    // Master Prompt Generator Form
    document.getElementById('form-prompt-gen')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const goal = document.getElementById('prompt-input-goal').value.trim();
        try {
            const res = await fetch('/api/prompt/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal })
            });
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
        alert('Master prompt copied to clipboard!');
    });
}

// --- LIVE COMPANION TERMINAL (MIKASA CHAT) ---
function initChat() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const chips = document.querySelectorAll('.chip');

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        await sendMessageToMikasa(text);
    });

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.getAttribute('data-query');
            if (query) {
                sendMessageToMikasa(query);
            }
        });
    });
}

async function sendMessageToMikasa(text) {
    const messagesContainer = document.getElementById('chat-messages-container');

    // 1. Append User Bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble bubble-user';
    userBubble.textContent = text;
    messagesContainer.appendChild(userBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 2. Append Typing Indicator
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble bubble-mikasa';
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
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                conversation_id: 'commander_session'
            })
        });

        const data = await res.json();
        typingBubble.remove();

        const reply = data.reply || 'I am here with you, Swapnil.';
        appendMikasaChatMessage(reply);

        // Auto-refresh memories and tasks silently
        setTimeout(() => {
            loadMemories();
            loadTasks();
            loadReminders();
        }, 1500);

    } catch (err) {
        typingBubble.remove();
        appendMikasaChatMessage(`⚠️ Could not reach neural core: ${err.message}`);
    }
}

function appendMikasaChatMessage(text) {
    const messagesContainer = document.getElementById('chat-messages-container');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bubble-mikasa';
    bubble.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <img src="/Mikasa-logo.jpeg" alt="Mikasa" class="chat-avatar-mikasa">
            <div style="flex: 1; line-height: 1.5;">${formatMarkdown(text)}</div>
        </div>
    `;
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
