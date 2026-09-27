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

    /**
     * Generate an instant 1-tap Google Calendar link
     * Pre-fills the event title, start time, end time, and details for mobile calendar apps
     */
    createGoogleCalendarUrl(title, dueAtMs, details = 'Reminder created by Mikasa AI Assistant 🧣') {
        const start = new Date(dueAtMs);
        const end = new Date(dueAtMs + 30 * 60 * 1000); // 30 min event block
        const formatGCal = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const dates = `${formatGCal(start)}/${formatGCal(end)}`;
        return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates}&details=${encodeURIComponent(details)}`;
    }

    // Parse friendly relative and absolute times: e.g. "tomorrow at 4pm", "today at 8pm", "5pm", "10m", "1h", "6hr later", "kal bikal 4ta"
    parseTime(timeStr) {
        if (!timeStr) return null;
        let text = timeStr.trim().toLowerCase();
        const now = Date.now();

        // Strip leading common prepositions/filler
        text = text.replace(/^(?:in|after|about|around|for|nearly|at|on)\s+/i, '').trim();
        // Strip trailing common words
        text = text.replace(/\s+(?:later|after|por|theke|dhore|pore|from\s+now|shomoy)$/i, '').trim();

        // 0A. Day + Time compound: "tomorrow at 4pm", "tomorrow 4pm", "today at 8:30pm", "kal 4pm", "kal 4ta"
        const dayTimeMatch = text.match(/^(tomorrow|kal|agamikal|today|aj|ajke)\s+(?:at\s+|shomoy\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|ta)?$/i);
        if (dayTimeMatch) {
            const dayWord = dayTimeMatch[1].toLowerCase();
            let hours = parseInt(dayTimeMatch[2]);
            const minutes = dayTimeMatch[3] ? parseInt(dayTimeMatch[3]) : 0;
            const meridiem = (dayTimeMatch[4] || '').toLowerCase();

            if (meridiem === 'pm' && hours < 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;
            // If "ta" or no meridiem, if hour <= 7 assume PM (e.g. 4ta -> 4pm, 5ta -> 5pm)
            if ((meridiem === 'ta' || !meridiem) && hours <= 7) hours += 12;

            const target = new Date(now);
            if (dayWord === 'tomorrow' || dayWord === 'kal' || dayWord === 'agamikal') {
                target.setDate(target.getDate() + 1);
            }
            target.setHours(hours, minutes, 0, 0);
            return target.getTime();
        }

        // 0B. Compound format: "1 hour 30 mins", "2h 15m", "1 hr and 20 mins"
        const compoundMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?|ghonta)\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minutes?|minit)$/i);
        if (compoundMatch) {
            const hrs = parseFloat(compoundMatch[1]);
            const mins = parseInt(compoundMatch[2]);
            return now + (hrs * 3600 + mins * 60) * 1000;
        }

        // 1. Seconds: "30s", "30 sec", "45 seconds"
        const secMatch = text.match(/^(\d+)\s*(?:s|sec|secs|seconds?)$/i);
        if (secMatch) return now + parseInt(secMatch[1]) * 1000;

        // 2. Minutes: "10m", "10 min", "15 minutes", "in 10 minutes", "10 minute"
        const minMatch = text.match(/^(\d+)\s*(?:m|min|mins|minutes?|minit|minute)$/i);
        if (minMatch) return now + parseInt(minMatch[1]) * 60 * 1000;

        // 3. Hours: "2h", "2 hours", "6hr", "6 hrs", "1.5h", "6 ghonta", "6 ghontar"
        const hrMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?|ghonta|ghontar?)$/i);
        if (hrMatch) return now + Math.round(parseFloat(hrMatch[1]) * 3600 * 1000);

        // 4. Days: "1 day", "2 days", "3 din"
        const dayMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:d|day|days|din)$/i);
        if (dayMatch) return now + Math.round(parseFloat(dayMatch[1]) * 86400 * 1000);

        // 5. Named relative times: "tomorrow", "kal", "agamikal", "tonight", "aj rate"
        if (text === 'tomorrow' || text === 'kal' || text === 'agamikal' || text === 'tomorrow morning') {
            const target = new Date(now);
            target.setDate(target.getDate() + 1);
            target.setHours(9, 0, 0, 0); // 9:00 AM next day
            return target.getTime() > now ? target.getTime() : now + 24 * 3600 * 1000;
        }

        if (text === 'tonight' || text === 'aj rate' || text === 'rate') {
            const target = new Date(now);
            target.setHours(21, 0, 0, 0); // 9:00 PM tonight
            if (target.getTime() <= now) {
                target.setHours(23, 0, 0, 0);
            }
            return target.getTime() > now ? target.getTime() : now + 4 * 3600 * 1000;
        }

        // 6. Specific clock time: e.g. "5pm", "5:30pm", "10:00 am"
        const clockMatch = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
        if (clockMatch) {
            let hours = parseInt(clockMatch[1]);
            const minutes = clockMatch[2] ? parseInt(clockMatch[2]) : 0;
            const meridiem = clockMatch[3].toLowerCase();
            if (meridiem === 'pm' && hours < 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;

            const target = new Date(now);
            target.setHours(hours, minutes, 0, 0);
            if (target.getTime() <= now) {
                target.setDate(target.getDate() + 1);
            }
            return target.getTime();
        }

        // 7. If plain number without unit: e.g. "6" -> assume hours if <= 12, else minutes
        const numMatch = text.match(/^(\d+)$/);
        if (numMatch) {
            const n = parseInt(numMatch[1]);
            if (n <= 12) return now + n * 3600 * 1000;
            return now + n * 60 * 1000;
        }

        return null;
    }

    extractReminderFromMessage(rawText) {
        if (!rawText) return null;
        const text = rawText.trim();

        const timeSpecRegex = '(?:tomorrow(?:\\s+at)?\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?|today(?:\\s+at)?\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?|kal(?:\\s+(?:at|shomoy))?\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)?(?:\\s+shomoy)?|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)|\\d+(?:\\.\\d+)?\\s*(?:m|min|mins|minutes?|h|hr|hrs|hours?|ghonta|d|days?|s|sec|seconds?)(?:\\s+(?:later|after|por|from\\s+now))?|tomorrow|tonight|kal|agamikal)';

        // Pattern 1: Slash command: /remind [time] [task]
        let m = text.match(new RegExp(`^\\/remind\\s+(?:in\\s+|at\\s+|on\\s+)?(${timeSpecRegex})\\s*(?:to\\s+|about\\s+|:\\s*|\\s+)?(.+)$`, 'i'));
        if (m) return { timeStr: m[1].trim(), task: m[2].trim() };

        // Pattern 2: "remind me [time] to [task]" e.g. "remind me tomorrow at 4pm to meet with supervisor"
        m = text.match(new RegExp(`^(?:please\\s+)?(?:remind\\s+me|remind)\\s+(?:in\\s+|at\\s+|on\\s+)?(${timeSpecRegex})\\s*(?:to\\s+|about\\s+|:\\s*|\\s+)(.+)$`, 'i'));
        if (m) return { timeStr: m[1].trim(), task: m[2].trim() };

        // Pattern 3: "remind me to [task] [time]" e.g. "remind me to check server in 30m" OR "remind me to meet supervisor tomorrow at 4pm"
        m = text.match(new RegExp(`^(?:please\\s+)?(?:remind\\s+me|remind)(?:\\s+to|\\s+about)?\\s+(.+?)\\s+(?:at|on|in|around)?\\s*(${timeSpecRegex})\\s*$`, 'i'));
        if (m) return { timeStr: m[2].trim(), task: m[1].trim() };

        // Pattern 4: Task then Time then 'remind me': 'call prince 2 hours later remind me'
        m = text.match(new RegExp(`^(.+?)\\s+(?:in|after|about|at|on)?\\s*(${timeSpecRegex})\\s+(?:remind\\s+me|remind\\s*koro)$`, 'i'));
        if (m) return { timeStr: m[2].trim(), task: m[1].trim() };

        // Pattern 5: Banglish prefix: 'amake kal 4ta shomoy mone koriye dio meeting ache'
        m = text.match(new RegExp(`^(?:amake\\s+)?(?:about\\s+)?(${timeSpecRegex})\\s*(?:mone\\s+koriye\\s+(?:dio|diyo|rekho)|remind\\s+koro)\\s*[:,-]?\\s*(.+)$`, 'i'));
        if (m) return { timeStr: m[1].trim(), task: m[2].trim() };

        // Pattern 6: Banglish postfix: 'medicine khete hobe amake 6 ghonta por mone koriye dio'
        m = text.match(new RegExp(`^(?:amake\\s+)?(.+?)\\s*(?:eta\\s+)?(?:about\\s+)?(${timeSpecRegex})\\s*(?:mone\\s+koriye\\s+(?:dio|diyo|rekho)|remind\\s+koro)$`, 'i'));
        if (m) return { timeStr: m[2].trim(), task: m[1].trim() };

        return null;
    }

    addReminder(text, timeStr, chatId) {
        let dueAt = this.parseTime(timeStr);
        if (!dueAt || isNaN(dueAt)) {
            console.warn(`[Reminders] Could not parse "${timeStr}", falling back to 1 hour`);
            dueAt = Date.now() + 3600 * 1000;
        }

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
