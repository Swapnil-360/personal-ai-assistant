/**
 * Sports Service for Mikasa AI
 * Fetches real-time sports fixtures, upcoming match schedules, and latest scores
 * for Commander Swapnil (FC Barcelona, Brazil National Team, Football, Cricket).
 * Automatically converts match kickoff times into Asia/Dhaka (BST) timezone.
 */

const https = require('https');
const { searchWeb } = require('./web_search_service');

function fetchJson(url, timeoutMs = 6000) {
    return new Promise((resolve) => {
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

function formatDhakaMatchTime(dateStr, timeStr) {
    if (!dateStr) return 'Date TBD';
    const cleanTime = timeStr ? timeStr.split('+')[0].trim() : '00:00:00';
    const iso = `${dateStr}T${cleanTime}Z`;
    try {
        const d = new Date(iso);
        return (
            new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Dhaka',
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                hour12: true
            }).format(d) + ' (Bangladesh Standard Time, BST)'
        );
    } catch (_) {
        return `${dateStr} ${timeStr || ''}`;
    }
}

// Known popular teams for instant zero-latency ID resolution
const KNOWN_TEAM_IDS = {
    'barca': '133739',
    'barcelona': '133739',
    'fc barcelona': '133739',
    'brazil': '134268',
    'selecao': '134268',
    'madrid': '133738',
    'real madrid': '133738',
    'argentina': '134269',
    'man city': '133613',
    'manchester city': '133613',
    'arsenal': '133604',
    'liverpool': '133602',
    'bayern': '133664',
    'psg': '133714'
};

/**
 * Get live upcoming match and recent result for a sports team
 * @param {string} queryOrTeam - e.g. "barca", "barcelona", "brazil", "football"
 * @returns {Promise<Object>}
 */
async function getLiveSportsFixture(queryOrTeam) {
    const raw = (queryOrTeam || '').toLowerCase().trim();
    if (!raw) return { error: 'No team or category provided' };

    let teamId = null;
    let detectedTeam = raw;

    // Check known IDs
    for (const [key, id] of Object.entries(KNOWN_TEAM_IDS)) {
        if (raw.includes(key)) {
            teamId = id;
            detectedTeam = key.toUpperCase();
            break;
        }
    }

    // Dynamic search if not in known IDs
    if (!teamId) {
        try {
            const search = await fetchJson(
                `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(raw)}`
            );
            if (search?.teams?.[0]?.idTeam) {
                teamId = search.teams[0].idTeam;
                detectedTeam = search.teams[0].strTeam;
            }
        } catch (_) {}
    }

    if (teamId) {
        try {
            const [nextRes, lastRes] = await Promise.all([
                fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${teamId}`),
                fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${teamId}`)
            ]);

            const nextEvent = nextRes?.events?.[0];
            const lastEvent = lastRes?.results?.[0];

            if (nextEvent || lastEvent) {
                return {
                    source: 'TheSportsDB (Live Schedule Engine)',
                    team: detectedTeam,
                    upcoming_match: nextEvent
                        ? {
                              match: nextEvent.strEvent,
                              league: nextEvent.strLeague,
                              round: nextEvent.intRound ? `Round ${nextEvent.intRound}` : null,
                              date: nextEvent.dateEvent,
                              time_utc: nextEvent.strTime,
                              dhaka_kickoff_time: formatDhakaMatchTime(nextEvent.dateEvent, nextEvent.strTime),
                              venue: nextEvent.strVenue || 'TBD',
                              home_team: nextEvent.strHomeTeam,
                              away_team: nextEvent.strAwayTeam
                          }
                        : 'No upcoming fixtures currently scheduled.',
                    last_match: lastEvent
                        ? {
                              match: lastEvent.strEvent,
                              league: lastEvent.strLeague,
                              date: lastEvent.dateEvent,
                              score: `${lastEvent.intHomeScore ?? '-'} - ${lastEvent.intAwayScore ?? '-'}`,
                              winner: lastEvent.strResult || null
                          }
                        : null
                };
            }
        } catch (e) {
            console.warn('[Sports Service Warning]:', e.message);
        }
    }

    // Fallback to web search if not found in TheSportsDB
    try {
        const webQuery = `${raw} next match fixture schedule live score 2026`;
        const webResults = await searchWeb(webQuery, 4);
        return {
            source: 'Web Search Fallback',
            team: raw,
            query: webQuery,
            results: (webResults || []).map((r) => ({
                title: r.title,
                snippet: r.snippet,
                url: r.url
            }))
        };
    } catch (err) {
        return { error: `Could not retrieve fixture for ${raw}: ${err.message}` };
    }
}

module.exports = {
    getLiveSportsFixture,
    formatDhakaMatchTime
};
