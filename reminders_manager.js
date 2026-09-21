const fs = require('fs');
const path = require('path');

const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

class RemindersManager {
    constructor() {
        this.reminders = [];
        this.timers = new Map();
        this.onReminderDue = null;
        this.loadReminders();
    }

    loadReminders() {
        try {
            if (fs.existsSync(REMINDERS_FILE)) {
                const data = fs.readFileSync(REMINDERS_FILE, 'utf8');
                this.reminders = JSON.parse(data || '[]');
            }
        } catch (e) {
            console.error('[Reminders] Error loading file:', e.message);
            this.reminders = [];
        }
    }

    saveReminders() {
        try {
            fs.writeFileSync(REMINDERS_FILE, JSON.stringify(this.reminders, null, 2), 'utf8');
        } catch (e) {
            console.error('[Reminders] Error saving file:', e.message);
        }
    }

    init(callback) {
        this.onReminderDue = callback;
        const now = Date.now();
        // Reschedule pending reminders that haven't fired yet
        for (const rem of this.reminders) {
            if (!rem.completed) {
                const delay = rem.dueAt - now;
                if (delay > 0) {
                    this.scheduleTimer(rem, delay);
                } else if (delay > -3600000) { // If missed within last 1 hour, fire now
                    this.fireReminder(rem);
                } else {
                    rem.completed = true;
                }
            }
        }
        this.saveReminders();
    }

    scheduleTimer(rem, delay) {
        if (this.timers.has(rem.id)) {
            clearTimeout(this.timers.get(rem.id));
        }
        const timer = setTimeout(() => {
            this.fireReminder(rem);
        }, delay);
        this.timers.set(rem.id, timer);
    }

    fireReminder(rem) {
        rem.completed = true;
        this.timers.delete(rem.id);
        this.saveReminders();
        if (this.onReminderDue) {
            this.onReminderDue(rem);
        }
    }

    // Parse friendly relative times like "10m", "1h", "30s", "in 15 mins", "tomorrow at 9am"
    parseTime(timeStr) {
        const text = timeStr.trim().toLowerCase();
        const now = Date.now();

        // 1. Seconds: "30s", "30 sec"
        const secMatch = text.match(/^(\d+)\s*(?:s|sec|seconds?)$/i);
        if (secMatch) return now + parseInt(secMatch[1]) * 1000;

        // 2. Minutes: "10m", "10 min", "15 minutes", "in 10 minutes"
        const minMatch = text.match(/^(?:in\s+)?(\d+)\s*(?:m|min|mins|minutes?)$/i);
        if (minMatch) return now + parseInt(minMatch[1]) * 60 * 1000;

        // 3. Hours: "2h", "2 hours", "in 1 hour"
        const hrMatch = text.match(/^(?:in\s+)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)$/i);
        if (hrMatch) return now + parseFloat(hrMatch[1]) * 3600 * 1000;

        // 4. Default fallback: 15 minutes
        return now + 15 * 60 * 1000;
    }

    addReminder(text, timeStr, chatId) {
        const dueAt = this.parseTime(timeStr);
        const rem = {
            id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            text: text.trim(),
            timeStr: timeStr,
            dueAt: dueAt,
            createdAt: Date.now(),
            chatId: chatId,
            completed: false
        };

        this.reminders.push(rem);
        this.saveReminders();

        const delay = Math.max(1000, dueAt - Date.now());
        this.scheduleTimer(rem, delay);

        return rem;
    }

    getActiveReminders() {
        const now = Date.now();
        return this.reminders.filter(r => !r.completed && r.dueAt > now);
    }

    cancelReminder(id) {
        const rem = this.reminders.find(r => r.id === id);
        if (rem) {
            rem.completed = true;
            if (this.timers.has(id)) {
                clearTimeout(this.timers.get(id));
                this.timers.delete(id);
            }
            this.saveReminders();
            return true;
        }
        return false;
    }
}

module.exports = new RemindersManager();
