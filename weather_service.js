const https = require('https');

function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { ...options, timeout: 4500 }, res => {
            if (res.statusCode !== 200) {
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
            reject(new Error('Weather request timed out'));
        });
    });
}

const WMO_CODES = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
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

/**
 * Fetch live weather using wttr.in as primary and Open-Meteo as high-availability failover.
 * Zero API keys required, 100% free.
 */
async function getLiveWeather(location = 'Dhaka') {
    const cleanLocation = (location || 'Dhaka').trim();
    const locLower = cleanLocation.toLowerCase();

    // 1. Primary Provider: wttr.in
    try {
        const wttrUrl = `https://wttr.in/${encodeURIComponent(cleanLocation)}?format=j1`;
        const data = await fetchJson(wttrUrl, {
            headers: {
                'User-Agent': 'curl/7.68.0',
                'Accept': 'application/json'
            }
        });

        const cur = data.current_condition?.[0] || {};
        const today = data.weather?.[0] || {};
        const hourly = today.hourly?.[0] || {};

        return {
            success: true,
            provider: 'wttr.in',
            location: cleanLocation,
            temperature_C: Math.round(Number(cur.temp_C) || 0),
            feelsLike_C: Math.round(Number(cur.FeelsLikeC) || Number(cur.temp_C) || 0),
            condition: (cur.weatherDesc?.[0]?.value || 'Clear').trim(),
            humidity: (cur.humidity || '0') + '%',
            wind: (cur.windspeedKmph || '0') + ' km/h',
            rainChance: (hourly.chanceofrain || '0') + '%',
            maxTemp_C: Math.round(Number(today.maxtempC) || Number(cur.temp_C) || 0),
            minTemp_C: Math.round(Number(today.mintempC) || Number(cur.temp_C) || 0)
        };
    } catch (wttrErr) {
        console.warn('[wttr.in unavailable, falling back to Open-Meteo]:', wttrErr.message);
    }

    // 2. High-Availability Provider: Open-Meteo
    try {
        let coords = KNOWN_COORDINATES[locLower] || KNOWN_COORDINATES['dhaka'];

        // If unknown city, try Open-Meteo Geocoding API (free, no key)
        if (!KNOWN_COORDINATES[locLower]) {
            try {
                const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanLocation)}&count=1`;
                const geoData = await fetchJson(geoUrl);
                if (geoData.results && geoData.results.length > 0) {
                    coords = {
                        lat: geoData.results[0].latitude,
                        lon: geoData.results[0].longitude
                    };
                }
            } catch (gErr) {}
        }

        const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
        const data = await fetchJson(openMeteoUrl);
        const cur = data.current || {};
        const daily = data.daily || {};
        const condition = WMO_CODES[cur.weather_code] || 'Clear';

        return {
            success: true,
            provider: 'Open-Meteo',
            location: cleanLocation,
            temperature_C: Math.round(Number(cur.temperature_2m) || 0),
            feelsLike_C: Math.round(Number(cur.apparent_temperature) || Number(cur.temperature_2m) || 0),
            condition: condition,
            humidity: Math.round(Number(cur.relative_humidity_2m) || 0) + '%',
            wind: Math.round(Number(cur.wind_speed_10m) || 0) + ' km/h',
            rainChance: String(daily.precipitation_probability_max?.[0] || 0) + '%',
            maxTemp_C: Math.round(Number(daily.temperature_2m_max?.[0]) || Number(cur.temperature_2m) || 0),
            minTemp_C: Math.round(Number(daily.temperature_2m_min?.[0]) || Number(cur.temperature_2m) || 0)
        };
    } catch (omErr) {
        console.error('[Open-Meteo Weather Error]:', omErr.message);
        throw new Error(`Weather services temporarily unreachable: ${omErr.message}`);
    }
}

/**
 * Format a natural, friendly Mikasa weather response for text and voice.
 */
function formatWeatherReport(weather, options = {}) {
    const isCommander = options.isCommander !== false;
    const isBanglish = options.isBanglish === true;
    const loc = weather.location || 'Dhaka';

    if (isBanglish) {
        return `🌤️ **${loc}-r Live Weather Update, ${isCommander ? 'Commander' : 'friend'}:**\n\n` +
            `• **Temperature:** ${weather.temperature_C}°C (Feels like ${weather.feelsLike_C}°C)\n` +
            `• **Condition:** ${weather.condition}\n` +
            `• **Brishtir chance:** ${weather.rainChance}\n` +
            `• **Humidity & Batash:** ${weather.humidity} humidity, ${weather.wind} batash\n` +
            `• **Range:** Shorbocco ${weather.maxTemp_C}°C | Shorbonimno ${weather.minTemp_C}°C\n\n` +
            (isCommander 
                ? `_Baire ber hole thanda mathay ber hote paro, tobe room e boshe code build korleo shob safe! 🧣_`
                : `_Enjoy your day! Let me know if you need any other updates. 🧣_`);
    }

    return `🌤️ **Live Weather Report for ${loc}, ${isCommander ? 'Commander' : 'friend'}:**\n\n` +
        `• **Current:** ${weather.temperature_C}°C (Feels like ${weather.feelsLike_C}°C)\n` +
        `• **Condition:** ${weather.condition}\n` +
        `• **Rain Probability:** ${weather.rainChance}\n` +
        `• **Humidity & Wind:** ${weather.humidity} humidity, ${weather.wind} wind\n` +
        `• **Today's Range:** High of ${weather.maxTemp_C}°C | Low of ${weather.minTemp_C}°C\n\n` +
        (isCommander
            ? `_Looks safe for your outdoor plans, Commander! Let me know if you are heading out or staying in to code. 🧣_`
            : `_Have a productive and safe day! Let me know if you need anything else. 🧣_`);
}

module.exports = {
    getLiveWeather,
    formatWeatherReport
};
