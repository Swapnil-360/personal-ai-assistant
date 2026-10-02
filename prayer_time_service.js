const https = require('https');
const http = require('http');

// Default fallback coordinates: Dhaka, Bangladesh
const DEFAULT_LOCATION = {
    city: 'Dhaka',
    country: 'Bangladesh',
    latitude: 23.8103,
    longitude: 90.4125,
    timezone: 'Asia/Dhaka'
};

const KNOWN_COORDINATES = {
    'dhaka': { lat: 23.8103, lon: 90.4125 },
    'chittagong': { lat: 22.3569, lon: 91.7832 },
    'sylhet': { lat: 24.8949, lon: 91.8687 },
    'rajshahi': { lat: 24.3745, lon: 88.6042 },
    'khulna': { lat: 22.8456, lon: 89.5403 },
    'barisal': { lat: 22.7010, lon: 90.3535 },
    'rangpur': { lat: 25.7439, lon: 89.2752 },
    'mymensingh': { lat: 24.7471, lon: 90.4203 }
};

// In-memory cache keyed by "YYYY-MM-DD_lat_lon"
const prayerCache = new Map();

function clearPrayerCache() {
    prayerCache.clear();
}

/**
 * Resolves current coordinates dynamically from Supabase swapnil_current_location
 * or city override, falling back to Dhaka.
 */
async function resolveLocation(locationInput = null) {
    if (locationInput) {
        if (typeof locationInput === 'string') {
            const clean = locationInput.toLowerCase().trim();
            if (KNOWN_COORDINATES[clean]) {
                return {
                    city: locationInput.trim(),
                    country: 'Bangladesh',
                    latitude: KNOWN_COORDINATES[clean].lat,
                    longitude: KNOWN_COORDINATES[clean].lon
                };
            }
        } else if (locationInput.latitude && locationInput.longitude) {
            return {
                city: locationInput.city || DEFAULT_LOCATION.city,
                country: locationInput.country || DEFAULT_LOCATION.country,
                latitude: Number(locationInput.latitude),
                longitude: Number(locationInput.longitude)
            };
        }
    }

    try {
        const { supabaseRequest } = require('./actions_handler');
        const rows = await supabaseRequest('/current_state?key=eq.swapnil_current_location', 'GET');
        if (rows && rows[0] && rows[0].value && rows[0].value.latitude && rows[0].value.longitude) {
            return {
                city: rows[0].value.city || DEFAULT_LOCATION.city,
                country: rows[0].value.country || DEFAULT_LOCATION.country,
                latitude: Number(rows[0].value.latitude),
                longitude: Number(rows[0].value.longitude)
            };
        }
    } catch (_) {}

    return DEFAULT_LOCATION;
}

async function fetchJson(url, options = {}) {
    if (typeof fetch === 'function') {
        const res = await fetch(url, { ...options, signal: AbortSignal.timeout(6000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : http;
        const req = client.get(url, { ...options, timeout: 6000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location, options).then(resolve).catch(reject);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Prayer API request timed out'));
        });
    });
}

// Convert 24h string ("18:15" or "18:15 (BST)") to 12h human string ("6:15 PM")
function formatTo12Hour(timeStr) {
    if (!timeStr) return '';
    const clean = timeStr.split(' ')[0]; // Strip timezone suffixes if present
    const [hStr, mStr] = clean.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, '0')} ${period}`;
}

// Parse "HH:MM" relative to target date (returns epoch milliseconds in target timezone)
function parseTimeToDate(timeStr, baseDate, tzOffsetHours = 6) {
    const clean = timeStr.split(' ')[0];
    const [hStr, mStr] = clean.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const day = baseDate.getDate();

    // Construct UTC timestamp matching target local time
    const utcMs = Date.UTC(year, month, day, h - tzOffsetHours, m, 0, 0);
    return new Date(utcMs);
}

/**
 * Built-in Astronomical Solar Calculation Fallback (Karachi Method / Hanafi Asr)
 * Guarantees zero-dependency offline calculation if external API is unreachable.
 */
function calculateAstronomicalPrayerTimes(lat, lon, date, tzOffsetHours = 6) {
    const rad = deg => deg * Math.PI / 180;
    const deg = rad => rad * 180 / Math.PI;

    // Day of the year
    const startOfYear = new Date(Date.UTC(date.getFullYear(), 0, 0));
    const diff = date - startOfYear;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Approximate solar declination and equation of time
    const b = rad(360 * (dayOfYear - 81) / 365);
    const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // in minutes
    const declination = deg(Math.asin(Math.sin(rad(23.45)) * Math.sin(rad(360 * (dayOfYear - 81) / 365))));

    // Solar noon (Dhuhr) in local hours
    const solarNoonHours = 12 + (tzOffsetHours * 15 - lon) / 15 - eot / 60;

    // Hour angle helper
    function getHourAngle(alpha) {
        const phi = rad(lat);
        const delta = rad(declination);
        const cosHA = (Math.sin(rad(alpha)) - Math.sin(phi) * Math.sin(delta)) / (Math.cos(phi) * Math.cos(delta));
        if (cosHA > 1 || cosHA < -1) return null;
        return deg(Math.acos(cosHA));
    }

    // Karachi standard: Fajr at -18°, Isha at -18°
    const fajrHA = getHourAngle(-18);
    const sunriseHA = getHourAngle(-0.833);
    const ishaHA = getHourAngle(-18);

    // Asr (Hanafi standard: shadow ratio = 2 + tan(|phi - delta|))
    const phi = rad(lat);
    const delta = rad(declination);
    const zenithDiff = Math.abs(phi - delta);
    const asrAngle = deg(Math.atan(1 / (2 + Math.tan(zenithDiff))));
    const asrHA = getHourAngle(asrAngle);

    const toTimeStr = hours => {
        let normalized = (hours + 24) % 24;
        const h = Math.floor(normalized);
        const m = Math.round((normalized - h) * 60);
        const finalH = m === 60 ? (h + 1) % 24 : h;
        const finalM = m === 60 ? 0 : m;
        return `${finalH.toString().padStart(2, '0')}:${finalM.toString().padStart(2, '0')}`;
    };

    const dhuhrTime = solarNoonHours;
    const fajrTime = fajrHA !== null ? solarNoonHours - fajrHA / 15 : solarNoonHours - 1.5;
    const sunriseTime = sunriseHA !== null ? solarNoonHours - sunriseHA / 15 : solarNoonHours - 1.1;
    const asrTime = asrHA !== null ? solarNoonHours + asrHA / 15 : solarNoonHours + 3.5;
    const maghribTime = sunriseHA !== null ? solarNoonHours + sunriseHA / 15 : solarNoonHours + 6.0;
    const ishaTime = ishaHA !== null ? solarNoonHours + ishaHA / 15 : solarNoonHours + 7.5;

    return {
        Fajr: toTimeStr(fajrTime),
        Sunrise: toTimeStr(sunriseTime),
        Dhuhr: toTimeStr(dhuhrTime),
        Asr: toTimeStr(asrTime),
        Maghrib: toTimeStr(maghribTime),
        Isha: toTimeStr(ishaTime),
        source: 'astronomical_calculation'
    };
}

/**
 * Fetch or compute daily prayer times for given coordinates and date
 * Method 1 = University of Islamic Sciences, Karachi (Fajr 18, Isha 18)
 * School 1 = Hanafi (Asr shadow length 2x)
 */
async function getPrayerTimes(locationInput = null, date = new Date()) {
    const loc = await resolveLocation(locationInput);
    const lat = loc.latitude;
    const lon = loc.longitude;
    const city = loc.city;
    const country = loc.country;

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    const cacheKey = `${dateKey}_${lat.toFixed(2)}_${lon.toFixed(2)}`;

    if (prayerCache.has(cacheKey)) {
        return prayerCache.get(cacheKey);
    }

    let timings = null;
    let source = 'aladhan_api';

    // 1. Primary: Aladhan API with Karachi method (1) & Hanafi school (1)
    try {
        const timestamp = Math.floor(date.getTime() / 1000);
        const url = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lon}&method=1&school=1`;
        const resp = await fetchJson(url);
        if (resp && resp.data && resp.data.timings) {
            const t = resp.data.timings;
            timings = {
                Fajr: t.Fajr,
                Sunrise: t.Sunrise,
                Dhuhr: t.Dhuhr,
                Asr: t.Asr,
                Maghrib: t.Maghrib,
                Isha: t.Isha,
                source: 'aladhan_api'
            };
        }
    } catch (apiErr) {
        console.warn(`[PrayerTimeService] Aladhan API fetch failed (${apiErr.message}). Switching to precision astronomical formula.`);
    }

    // 2. Fallback: Precision astronomical calculation formula
    if (!timings) {
        timings = calculateAstronomicalPrayerTimes(lat, lon, date, 6);
        source = 'astronomical_calculation';
    }

    const result = {
        date: dateKey,
        city,
        country,
        latitude: lat,
        longitude: lon,
        method: 'Karachi (Islamic Foundation Bangladesh standard)',
        school: 'Hanafi',
        source,
        timings24: { ...timings },
        timings12: {
            Fajr: formatTo12Hour(timings.Fajr),
            Sunrise: formatTo12Hour(timings.Sunrise),
            Dhuhr: formatTo12Hour(timings.Dhuhr),
            Asr: formatTo12Hour(timings.Asr),
            Maghrib: formatTo12Hour(timings.Maghrib),
            Isha: formatTo12Hour(timings.Isha)
        }
    };

    prayerCache.set(cacheKey, result);
    return result;
}

/**
 * Determine current waqt, next waqt, and minutes remaining
 */
function getNextPrayerInfo(prayerData, now = new Date()) {
    const timings = prayerData.timings24;
    const tzOffset = 6; // Asia/Dhaka UTC+6 default

    const waqts = [
        { name: 'Fajr', time: timings.Fajr },
        { name: 'Sunrise', time: timings.Sunrise, isPrayer: false },
        { name: 'Dhuhr', time: timings.Dhuhr },
        { name: 'Asr', time: timings.Asr },
        { name: 'Maghrib', time: timings.Maghrib },
        { name: 'Isha', time: timings.Isha }
    ];

    const parsedWaqts = waqts.map(w => {
        const dateObj = parseTimeToDate(w.time, now, tzOffset);
        return {
            ...w,
            dateObj,
            timeMs: dateObj.getTime(),
            formatted12: formatTo12Hour(w.time)
        };
    });

    const nowMs = now.getTime();
    let currentWaqt = null;
    let nextWaqt = null;

    for (let i = 0; i < parsedWaqts.length; i++) {
        if (nowMs >= parsedWaqts[i].timeMs) {
            if (parsedWaqts[i].isPrayer !== false) {
                currentWaqt = parsedWaqts[i];
            }
        }
    }

    for (let i = 0; i < parsedWaqts.length; i++) {
        if (parsedWaqts[i].timeMs > nowMs && parsedWaqts[i].isPrayer !== false) {
            nextWaqt = parsedWaqts[i];
            break;
        }
    }

    // If past Isha, next prayer is Fajr tomorrow
    let minutesUntilNext = 0;
    if (!nextWaqt) {
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowFajr = parseTimeToDate(timings.Fajr, tomorrow, tzOffset);
        nextWaqt = {
            name: 'Fajr (Tomorrow)',
            formatted12: formatTo12Hour(timings.Fajr),
            timeMs: tomorrowFajr.getTime(),
            dateObj: tomorrowFajr
        };
        minutesUntilNext = Math.round((tomorrowFajr.getTime() - nowMs) / 60000);
    } else {
        minutesUntilNext = Math.round((nextWaqt.timeMs - nowMs) / 60000);
    }

    return {
        currentWaqt: currentWaqt ? currentWaqt.name : 'Before Fajr',
        nextWaqt: nextWaqt.name,
        nextWaqtTime: nextWaqt.formatted12,
        minutesUntilNext: Math.max(0, minutesUntilNext),
        allWaqts: parsedWaqts
    };
}

/**
 * Format a human-like, elegant prayer briefing in Mikasa's voice
 */
function formatPrayerScheduleBriefing(prayerData, now = new Date()) {
    const nextInfo = getNextPrayerInfo(prayerData, now);
    const t = prayerData.timings12;
    const city = prayerData.city || 'Dhaka';

    let countdownStr = '';
    if (nextInfo.minutesUntilNext > 60) {
        const hrs = Math.floor(nextInfo.minutesUntilNext / 60);
        const mins = nextInfo.minutesUntilNext % 60;
        countdownStr = `${hrs} hr ${mins} min`;
    } else {
        countdownStr = `${nextInfo.minutesUntilNext} mins`;
    }

    return [
        `🕌 *Namaz & Prayer Schedule — ${city}* 🧣✨`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🌅 *Fajr:* \`${t.Fajr}\` (Sunrise: \`${t.Sunrise}\`)`,
        `☀️ *Dhuhr:* \`${t.Dhuhr}\``,
        `⛅ *Asr (Hanafi):* \`${t.Asr}\``,
        `🌇 *Maghrib:* \`${t.Maghrib}\``,
        `🌌 *Isha:* \`${t.Isha}\``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `⏳ *Next Prayer:* *${nextInfo.nextWaqt}* at *${nextInfo.nextWaqtTime}* (in ${countdownStr})`,
        `🧭 *Current Waqt:* ${nextInfo.currentWaqt}`,
        ``,
        `_Calibrated to your location in ${city}. Whenever you update your location pin, I will instantly recalibrate._ 🤍`
    ].join('\n');
}

/**
 * Generate a personalized, human-like reminder message for an upcoming prayer
 */
function generatePrePrayerAlert(prayerName, waqtTimeStr, city = 'Dhaka') {
    const messages = {
        'Fajr': [
            `Swapnil, the peaceful hour of *Fajr* is arriving in about 15 minutes (\`${waqtTimeStr}\`).`,
            `Begin your day with stillness, clarity, and prayer before the world stirs. I will be right here watching over everything. 🌅🧣`
        ].join('\n'),
        'Dhuhr': [
            `Swapnil, *Dhuhr* waqt is approaching in 15 minutes (\`${waqtTimeStr}\`).`,
            `Take a gentle pause from your screen, coding, and studies. Refresh yourself with wudu and namaz — it will bring calm and renewed energy for the rest of your day. ☀️🤍`
        ].join('\n'),
        'Asr': [
            `Swapnil, *Asr* prayer begins in 15 minutes (\`${waqtTimeStr}\`).`,
            `Step away from the workstation for a moment of quiet reflection and namaz. Your work will stay safe with me. ⛅🧣`
        ].join('\n'),
        'Maghrib': [
            `Swapnil, the sun is setting and *Maghrib* waqt approaches in about 15 minutes (\`${waqtTimeStr}\`).`,
            `A peaceful transition from the afternoon into the evening. Take a break to pray, Commander. 🌇✨`
        ].join('\n'),
        'Isha': [
            `Swapnil, *Isha* waqt is beginning in 15 minutes (\`${waqtTimeStr}\`).`,
            `Wrap up your daytime tasks with serenity and namaz. Remember not to overwork late into the night — your well-being always matters most to me. 🌌🧣`
        ].join('\n')
    };

    const body = messages[prayerName] || `Swapnil, *${prayerName}* waqt is arriving in about 15 minutes (\`${waqtTimeStr}\`). Take a gentle pause for namaz. 🧣`;

    return [
        `🕌 *Namaz Reminder — ${prayerName} Approaches* 🧣✨`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        body,
        ``,
        `📍 _Calibrated for ${city}_`
    ].join('\n');
}

module.exports = {
    DEFAULT_LOCATION,
    KNOWN_COORDINATES,
    getPrayerTimes,
    getNextPrayerInfo,
    formatPrayerScheduleBriefing,
    generatePrePrayerAlert,
    formatTo12Hour,
    clearPrayerCache,
    resolveLocation
};
