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

    generateIcs(rem) {
        const start = new Date(rem.dueAt);
        const end = new Date(rem.dueAt + 30 * 60 * 1000);
        const formatIcsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const nowStr = formatIcsDate(new Date());

        const summary = (rem.text || 'Reminder').replace(/\n/g, ' ');
        const details = (rem.draftContent ? `${rem.draftContent}\n\n` : '') + 'Scheduled by Mikasa AI Assistant 🧣';

        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Mikasa AI Assistant//Swapnil OS//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${rem.id}@mrswapnil.me`,
            `DTSTAMP:${nowStr}`,
            `DTSTART:${formatIcsDate(start)}`,
            `DTEND:${formatIcsDate(end)}`,
            `SUMMARY:${summary}`,
            `DESCRIPTION:${details.replace(/\n/g, '\\n')}`,
            'STATUS:CONFIRMED',
            'BEGIN:VALARM',
            'TRIGGER:-PT15M',
            'ACTION:DISPLAY',
            `DESCRIPTION:${summary}`,
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');
    }

    generateCalendarFeed(reminders) {
        const formatIcsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const nowStr = formatIcsDate(new Date());

        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Mikasa AI Assistant//Swapnil OS//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Mikasa AI Reminders & Alarms'
        ];

        for (const rem of reminders) {
            const start = new Date(rem.dueAt);
            const end = new Date(rem.dueAt + 30 * 60 * 1000);
            const summary = (rem.text || 'Reminder').replace(/\n/g, ' ');
            const details = (rem.draftContent ? `${rem.draftContent}\n\n` : '') + 'Scheduled by Mikasa AI Assistant 🧣';

            lines.push(
                'BEGIN:VEVENT',
                `UID:${rem.id}@mrswapnil.me`,
                `DTSTAMP:${nowStr}`,
                `DTSTART:${formatIcsDate(start)}`,
                `DTEND:${formatIcsDate(end)}`,
                `SUMMARY:${summary}`,
                `DESCRIPTION:${details.replace(/\n/g, '\\n')}`,
                'STATUS:CONFIRMED',
                'BEGIN:VALARM',
                'TRIGGER:-PT15M',
                'ACTION:DISPLAY',
                `DESCRIPTION:${summary}`,
                'END:VALARM',
                'END:VEVENT'
            );
        }

        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    // Parse friendly relative and absolute times: e.g. "tomorrow at 4pm", "Friday at 4pm", "next Monday 10am", "October 5 at 3pm", "set alarm for 7am", "poroshu 10ta"
    parseTime(timeStr) {
        if (!timeStr) return null;
        let text = timeStr.trim().toLowerCase();
        const now = Date.now();
        const nowDate = new Date(now);

        const MONTHS = {
            jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
            apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
            aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
            nov: 10, november: 10, dec: 11, december: 11
        };

        const WEEKDAYS = {
            sunday: 0, sun: 0, robibar: 0, robi: 0,
            monday: 1, mon: 1, shombar: 1, shom: 1,
            tuesday: 2, tue: 2, mongolbar: 2, mongol: 2,
            wednesday: 3, wed: 3, budhbar: 3, budh: 3,
            thursday: 4, thu: 4, brihospotibar: 4, brihospoti: 4,
            friday: 5, fri: 5, shukrobar: 5, shukro: 5,
            saturday: 6, sat: 6, shonibar: 6, shoni: 6
        };

        // Strip leading common prepositions/filler and alarm prefixes
        text = text.replace(/^(?:in|after|about|around|for|nearly|at|on|set\s+(?:an?\s+)?alarm\s+(?:for|at)?|alarm\s+(?:for|at)?)\s+/i, '').trim();
        // Strip trailing common words
        text = text.replace(/\s+(?:later|after|por|theke|dhore|pore|from\s+now|shomoy)$/i, '').trim();

        // Banglish period hint detection
        let periodHint = null;
        if (/\b(?:shokal|shokale|morning)\b/i.test(text)) periodHint = 'am';
        if (/\b(?:bikal|bikale|shondha|shondhay|evening|dupur|dupure|afternoon)\b/i.test(text)) periodHint = 'pm';
        if (/\b(?:rat|rate|night)\b/i.test(text)) periodHint = 'night';

        // Clean text of period hints for numerical parsing
        const cleanText = text.replace(/\b(?:shokal|shokale|dupur|dupure|bikal|bikale|shondha|shondhay|rat|rate|morning|evening|afternoon|night)\b/gi, '').trim().replace(/\s+/g, ' ');

        // 0A. Day after tomorrow / "poroshu"
        const poroshuMatch = cleanText.match(/^(?:the\s+)?(?:day\s+after\s+tomorrow|poroshu|poroshudin)\s*(?:at\s+|shomoy\s+)?(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm|ta|tay)?)?$/i);
        if (poroshuMatch) {
            const target = new Date(now);
            target.setDate(target.getDate() + 2);
            let hours = poroshuMatch[1] ? parseInt(poroshuMatch[1]) : 9;
            const minutes = poroshuMatch[2] ? parseInt(poroshuMatch[2]) : 0;
            let meridiem = (poroshuMatch[3] || periodHint || '').toLowerCase();
            if (periodHint === 'pm' && hours < 12) hours += 12;
            if (periodHint === 'am' && hours === 12) hours = 0;
            if (periodHint === 'night' && hours < 12 && hours >= 6) hours += 12;
            if (meridiem === 'pm' && hours < 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;
            if ((meridiem === 'ta' || meridiem === 'tay' || !meridiem) && hours <= 7 && poroshuMatch[1] && !periodHint) hours += 12;
            target.setHours(hours, minutes, 0, 0);
            return target.getTime();
        }

        // 0B. Weekday: e.g. "Monday at 10am", "next Friday", "Friday 4pm", "shukrobar 4ta"
        const weekdayRegex = '(?:next\\s+)?(sunday|sun|robibar|monday|mon|shombar|tuesday|tue|mongolbar|wednesday|wed|budhbar|thursday|thu|brihospotibar|friday|fri|shukrobar|saturday|sat|shonibar)';
        const weekdayMatch = cleanText.match(new RegExp(`^${weekdayRegex}\\s*(?:at\\s+|shomoy\\s+)?(?:(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|ta|tay)?)?$`, 'i'));
        if (weekdayMatch) {
            const dayName = weekdayMatch[1].toLowerCase();
            const targetDay = WEEKDAYS[dayName];
            if (targetDay !== undefined) {
                const currentDay = nowDate.getDay();
                let dayDiff = targetDay - currentDay;
                if (dayDiff <= 0 || text.startsWith('next ')) {
                    dayDiff += 7;
                }
                const target = new Date(now);
                target.setDate(target.getDate() + dayDiff);
                let hours = weekdayMatch[2] ? parseInt(weekdayMatch[2]) : 9;
                const minutes = weekdayMatch[3] ? parseInt(weekdayMatch[3]) : 0;
                let meridiem = (weekdayMatch[4] || periodHint || '').toLowerCase();
                if (periodHint === 'pm' && hours < 12) hours += 12;
                if (periodHint === 'am' && hours === 12) hours = 0;
                if (periodHint === 'night' && hours < 12 && hours >= 6) hours += 12;
                if (meridiem === 'pm' && hours < 12) hours += 12;
                if (meridiem === 'am' && hours === 12) hours = 0;
                if ((meridiem === 'ta' || meridiem === 'tay' || !meridiem) && hours <= 7 && weekdayMatch[2] && !periodHint) hours += 12;
                target.setHours(hours, minutes, 0, 0);
                return target.getTime();
            }
        }

        // 0C. Prayer / Namaz Time: "for Asr", "Maghrib namaz", "10 min before Asr", "Fajr", "Isha"
        const prayerMatch = cleanText.match(/^(?:(?:at|for|around)\s+)?(?:(\d+)\s*(?:min|mins|minute|minutes)\s+before\s+)?(fajr|dhuhr|zuhr|johr|asr|maghrib|magrib|isha|esha)(?:\s+(?:namaz|prayer|waqt|shomoy))?$/i);
        if (prayerMatch) {
            try {
                const pNameMap = {
                    fajr: 'Fajr',
                    dhuhr: 'Dhuhr', zuhr: 'Dhuhr', johr: 'Dhuhr',
                    asr: 'Asr',
                    maghrib: 'Maghrib', magrib: 'Maghrib',
                    isha: 'Isha', esha: 'Isha'
                };
                const pName = pNameMap[prayerMatch[2].toLowerCase()] || 'Dhuhr';
                const offsetMins = prayerMatch[1] ? parseInt(prayerMatch[1], 10) : 0;
                const defaultTimings = { Fajr: '04:35', Dhuhr: '11:48', Asr: '16:06', Maghrib: '17:45', Isha: '19:00' };

                let time24 = defaultTimings[pName] || '12:00';
                try {
                    const { getPrayerTimes } = require('./prayer_time_service');
                    // Check if prayer_time_service has synchronous or cached timings
                    const cached = getPrayerTimes(null, nowDate);
                    if (cached && cached.timings24 && cached.timings24[pName]) {
                        time24 = cached.timings24[pName];
                    }
                } catch (_) {}

                const [hStr, mStr] = time24.split(':');
                let h = parseInt(hStr, 10);
                let m = parseInt(mStr, 10) - offsetMins;
                while (m < 0) {
                    m += 60;
                    h -= 1;
                }
                const target = new Date(now);
                target.setHours(h, m, 0, 0);
                if (target.getTime() <= now) {
                    target.setDate(target.getDate() + 1);
                }
                return target.getTime();
            } catch (_) {}
        }

        // 0D. Calendar Date: "October 5 at 3pm", "5th October", "Sep 30 at 9pm"
        const monthFirstMatch = cleanText.match(/^(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:at\s+|shomoy\s+)?(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm|ta|tay)?)?$/i);
        const dayFirstMatch = cleanText.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s*(?:at\s+|shomoy\s+)?(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm|ta|tay)?)?$/i);

        const dateMatch = monthFirstMatch || dayFirstMatch;
        if (dateMatch) {
            const monthName = (monthFirstMatch ? dateMatch[1] : dateMatch[2]).toLowerCase();
            const dayNum = parseInt(monthFirstMatch ? dateMatch[2] : dateMatch[1]);
            const monthIdx = MONTHS[monthName];

            if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
                const target = new Date(now);
                let year = target.getFullYear();
                target.setMonth(monthIdx, dayNum);

                let hours = dateMatch[3] ? parseInt(dateMatch[3]) : 9;
                const minutes = dateMatch[4] ? parseInt(dateMatch[4]) : 0;
                let meridiem = (dateMatch[5] || periodHint || '').toLowerCase();
                if (periodHint === 'pm' && hours < 12) hours += 12;
                if (periodHint === 'am' && hours === 12) hours = 0;
                if (periodHint === 'night' && hours < 12 && hours >= 6) hours += 12;
                if (meridiem === 'pm' && hours < 12) hours += 12;
                if (meridiem === 'am' && hours === 12) hours = 0;
                if ((meridiem === 'ta' || meridiem === 'tay' || !meridiem) && hours <= 7 && dateMatch[3] && !periodHint) hours += 12;

                target.setHours(hours, minutes, 0, 0);
                if (target.getTime() < now) {
                    target.setFullYear(year + 1);
                }
                return target.getTime();
            }
        }

        // 0D. Day + Time compound: "tomorrow at 4pm", "today at 8:30pm", "kal 4pm", "kal 4ta"
        const dayTimeMatch = cleanText.match(/^(tomorrow|kal|agamikal|today|aj|ajke)\s+(?:at\s+|shomoy\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|ta|tay)?$/i);
        if (dayTimeMatch) {
            const dayWord = dayTimeMatch[1].toLowerCase();
            let hours = parseInt(dayTimeMatch[2]);
            const minutes = dayTimeMatch[3] ? parseInt(dayTimeMatch[3]) : 0;
            let meridiem = (dayTimeMatch[4] || periodHint || '').toLowerCase();

            if (periodHint === 'pm' && hours < 12) hours += 12;
            if (periodHint === 'am' && hours === 12) hours = 0;
            if (periodHint === 'night' && hours < 12 && hours >= 6) hours += 12;
            if (meridiem === 'pm' && hours < 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;
            if ((meridiem === 'ta' || meridiem === 'tay' || !meridiem) && hours <= 7 && !periodHint) hours += 12;

            const target = new Date(now);
            if (dayWord === 'tomorrow' || dayWord === 'kal' || dayWord === 'agamikal') {
                target.setDate(target.getDate() + 1);
            }
            target.setHours(hours, minutes, 0, 0);
            return target.getTime();
        }

        // 0E. Compound format: "1 hour 30 mins", "2h 15m", "1 hr and 20 mins"
        const compoundMatch = cleanText.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?|ghonta)\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minutes?|minit)$/i);
        if (compoundMatch) {
            const hrs = parseFloat(compoundMatch[1]);
            const mins = parseInt(compoundMatch[2]);
            return now + (hrs * 3600 + mins * 60) * 1000;
        }

        // 1. Seconds: "30s", "30 sec", "45 seconds"
        const secMatch = cleanText.match(/^(\d+)\s*(?:s|sec|secs|seconds?)$/i);
        if (secMatch) return now + parseInt(secMatch[1]) * 1000;

        // 2. Minutes: "10m", "10 min", "15 minutes", "in 10 minutes", "10 minute"
        const minMatch = cleanText.match(/^(\d+)\s*(?:m|min|mins|minutes?|minit|minute)$/i);
        if (minMatch) return now + parseInt(minMatch[1]) * 60 * 1000;

        // 3. Hours: "2h", "2 hours", "6hr", "6 hrs", "1.5h", "6 ghonta", "6 ghontar"
        const hrMatch = cleanText.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?|ghonta|ghontar?)$/i);
        if (hrMatch) return now + Math.round(parseFloat(hrMatch[1]) * 3600 * 1000);

        // 4. Days: "1 day", "2 days", "3 din"
        const dayMatch = cleanText.match(/^(\d+(?:\.\d+)?)\s*(?:d|day|days|din)$/i);
        if (dayMatch) return now + Math.round(parseFloat(dayMatch[1]) * 86400 * 1000);

        // 5. Named relative times: "tomorrow", "kal", "agamikal", "tonight", "aj rate"
        if (cleanText === 'tomorrow' || cleanText === 'kal' || cleanText === 'agamikal' || cleanText === 'tomorrow morning') {
            const target = new Date(now);
            target.setDate(target.getDate() + 1);
            target.setHours(9, 0, 0, 0); // 9:00 AM next day
            return target.getTime() > now ? target.getTime() : now + 24 * 3600 * 1000;
        }

        if (cleanText === 'tonight' || cleanText === 'aj rate' || cleanText === 'rate') {
            const target = new Date(now);
            target.setHours(21, 0, 0, 0); // 9:00 PM tonight
            if (target.getTime() <= now) {
                target.setHours(23, 0, 0, 0);
            }
            return target.getTime() > now ? target.getTime() : now + 4 * 3600 * 1000;
        }

        // 6. Specific clock time: e.g. "5pm", "5:30pm", "10:00 am", "18:00"
        const clockMatch = cleanText.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
        if (clockMatch) {
            let hours = parseInt(clockMatch[1]);
            const minutes = clockMatch[2] ? parseInt(clockMatch[2]) : 0;
            let meridiem = (clockMatch[3] || periodHint || '').toLowerCase();
            if (periodHint === 'pm' && hours < 12) hours += 12;
            if (periodHint === 'am' && hours === 12) hours = 0;
            if (periodHint === 'night' && hours < 12 && hours >= 6) hours += 12;
            if (meridiem === 'pm' && hours < 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;
            if (!meridiem && !periodHint && hours <= 7) hours += 12;

            const target = new Date(now);
            target.setHours(hours, minutes, 0, 0);
            if (target.getTime() <= now) {
                target.setDate(target.getDate() + 1);
            }
            return target.getTime();
        }

        // 7. If plain number without unit: e.g. "6" -> assume hours if <= 12, else minutes
        const numMatch = cleanText.match(/^(\d+)$/);
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

        const weekdays = 'next\\s+[a-z]+|sunday|sun|robibar|monday|mon|shombar|tuesday|tue|mongolbar|wednesday|wed|budhbar|thursday|thu|brihospotibar|friday|fri|shukrobar|saturday|sat|shonibar';
        const months = 'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec';
        const periods = 'shokal|shokale|dupur|dupure|bikal|bikale|shondha|shondhay|rat|rate|morning|evening|afternoon|night';
        const dayAfter = 'the\\s+day\\s+after\\s+tomorrow|day\\s+after\\s+tomorrow|poroshu|poroshudin';

        const timeSpecRegex = `(?:` +
            `(?:${months})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s+(?:at\\s+|shomoy\\s+)?(?:(?:${periods})\\s*)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)?)?|` +
            `\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${months})(?:\\s+(?:at\\s+|shomoy\\s+)?(?:(?:${periods})\\s*)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)?)?|` +
            `(?:${weekdays})(?:\\s+(?:at\\s+|shomoy\\s+)?(?:(?:${periods})\\s*)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)?)?|` +
            `(?:${dayAfter})(?:\\s+(?:at\\s+|shomoy\\s+)?(?:(?:${periods})\\s*)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)?)?|` +
            `(?:tomorrow|kal|agamikal|today|aj|ajke)(?:\\s+(?:at\\s+|shomoy\\s+)?(?:(?:${periods})\\s*)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)?)?|` +
            `\\d+(?:\\.\\d+)?\\s*(?:m|min|mins|minutes?|h|hr|hrs|hours?|ghonta|d|day|days?|din|s|sec|seconds?)(?:\\s+(?:later|after|por|from\\s+now))?|` +
            `(?:(?:${periods})\\s*)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|ta|tay)|` +
            `tomorrow|tonight|kal|agamikal|poroshu` +
        `)`;

        // Pattern 0: Alarms (e.g. "set alarm for 7:30am", "alarm for tomorrow at 8am")
        let m = text.match(new RegExp(`^(?:please\\s+)?(?:set\\s+(?:an?\\s+)?)?alarm\\s+(?:for\\s+|at\\s+)?(${timeSpecRegex})(?:\\s+(?:for|to|about)\\s+(.+))?$`, 'i'));
        if (m) return { timeStr: m[1].trim(), task: m[2] ? m[2].trim() : 'Alarm', isAlarm: true };

        m = text.match(new RegExp(`^\\/alarm\\s+(?:for\\s+|at\\s+)?(${timeSpecRegex})(?:\\s+(.+))?$`, 'i'));
        if (m) return { timeStr: m[1].trim(), task: m[2] ? m[2].trim() : 'Alarm', isAlarm: true };

        // Pattern 0P: Dedicated Prayer / Namaz Reminders (e.g. "remind me for Asr", "remind me for Maghrib namaz", "remind me 15 mins before Isha")
        const prayerSpec = `(?:(?:at|for|around)\\s+)?(?:\\d+\\s*(?:min|mins|minute|minutes)\\s+before\\s+)?(?:fajr|dhuhr|zuhr|johr|asr|maghrib|magrib|isha|esha)(?:\\s+(?:namaz|prayer|waqt|shomoy))?`;
        let pm = text.match(new RegExp(`^(?:please\\s+)?(?:remind\\s+me|remind)(?:\\s+about|\\s+for|\\s+at)?\\s+(${prayerSpec})\\s*$`, 'i'));
        if (pm) {
            const rawTime = pm[1].trim();
            const prayerNameMatch = rawTime.match(/(fajr|dhuhr|zuhr|johr|asr|maghrib|magrib|isha|esha)/i);
            const pName = prayerNameMatch ? (prayerNameMatch[1].charAt(0).toUpperCase() + prayerNameMatch[1].slice(1).toLowerCase()) : 'Namaz';
            return {
                timeStr: rawTime,
                task: `${pName} Namaz`
            };
        }

        // Pattern 1: Slash command: /remind [time] [task]
        m = text.match(new RegExp(`^\\/remind\\s+(?:in\\s+|at\\s+|on\\s+)?(${timeSpecRegex})\\s*(?:to\\s+|about\\s+|:\\s*|\\s+)?(.+)$`, 'i'));
        if (m) return { timeStr: m[1].trim(), task: m[2].trim() };

        // Pattern 2: "remind me [time] to [task]" e.g. "remind me on Friday at 4pm to meet supervisor"
        m = text.match(new RegExp(`^(?:please\\s+)?(?:remind\\s+me|remind)\\s+(?:in\\s+|at\\s+|on\\s+)?(${timeSpecRegex})\\s*(?:to\\s+|about\\s+|:\\s*|\\s+)(.+)$`, 'i'));
        if (m) return { timeStr: m[1].trim(), task: m[2].trim() };

        // Pattern 3: "remind me to [task] [time]" e.g. "remind me to check server in 30m" OR "remind me to meet supervisor on Friday at 4pm"
        m = text.match(new RegExp(`^(?:please\\s+)?(?:remind\\s+me|remind)(?:\\s+to|\\s+about)?\\s+(.+?)\\s+(?:at|on|in|around)\\s+(${timeSpecRegex})\\s*$`, 'i'));
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

    addReminder(text, timeStr, chatId, metadata = {}) {
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
            completed: false,
            ...(typeof metadata === 'object' && metadata !== null ? metadata : {})
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
