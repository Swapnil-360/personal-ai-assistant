/**
 * Web Search Service for Mikasa AI
 * Fast, reliable, zero-API-key web search engine using DuckDuckGo + Wikipedia
 * Provides live web snippets, titles, and sources to ground AI replies.
 */

const https = require('https');
const http = require('http');

/**
 * Clean HTML tags and entities
 */
function cleanHtmlText(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract destination URL from DuckDuckGo redirect link
 */
function extractTargetUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        const match = rawUrl.match(/[?&]uddg=([^&]+)/);
        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }
        if (rawUrl.startsWith('//')) {
            return 'https:' + rawUrl;
        }
        return rawUrl;
    } catch (e) {
        return rawUrl;
    }
}

/**
 * Search DuckDuckGo HTML interface
 */
function searchDuckDuckGo(query, maxResults = 5) {
    return new Promise((resolve) => {
        const cleanQuery = encodeURIComponent(query.trim());
        const url = `https://html.duckduckgo.com/html/?q=${cleanQuery}`;

        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
            },
            timeout: 5500
        }, (res) => {
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                const results = [];
                const blocks = html.split('<div class="result results_links results_links_deep web-result');
                for (let i = 1; i < blocks.length && results.length < maxResults; i++) {
                    const block = blocks[i];
                    const titleMatch = block.match(/<h2 class="result__title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
                    const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/i);
                    const linkMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                                     block.match(/<a class="result__snippet[^>]*href="([^"]+)"/i);

                    const title = titleMatch ? cleanHtmlText(titleMatch[1]) : '';
                    const snippet = snippetMatch ? cleanHtmlText(snippetMatch[1]) : '';
                    const rawUrl = linkMatch ? linkMatch[1] : '';
                    const url = extractTargetUrl(rawUrl);

                    if (snippet && title) {
                        results.push({ title, snippet, url });
                    }
                }
                resolve(results);
            });
        });

        req.on('error', (err) => {
            console.warn('[Web Search DDG Warning]:', err.message);
            resolve([]);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve([]);
        });
    });
}

/**
 * Fallback to Wikipedia API for knowledge queries
 */
function searchWikipedia(query, maxResults = 3) {
    return new Promise((resolve) => {
        const cleanQuery = encodeURIComponent(query.trim());
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${cleanQuery}&format=json&utf8=1&srlimit=${maxResults}`;

        const req = https.get(url, {
            headers: { 'User-Agent': 'MikasaAI/2.0 (Personal AI Assistant)' },
            timeout: 4000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const items = (json.query && json.query.search) || [];
                    const results = items.map(item => ({
                        title: item.title,
                        snippet: cleanHtmlText(item.snippet),
                        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`
                    }));
                    resolve(results);
                } catch (e) {
                    resolve([]);
                }
            });
        });

        req.on('error', () => resolve([]));
        req.on('timeout', () => {
            req.destroy();
            resolve([]);
        });
    });
}

/**
 * Main Web Search interface
 * Queries DuckDuckGo and augments with Wikipedia if needed
 */
async function searchWeb(query, maxResults = 5) {
    if (!query || query.trim().length < 2) return [];
    const clean = query.trim();

    try {
        const ddgResults = await searchDuckDuckGo(clean, maxResults);
        if (ddgResults.length >= 2) {
            return ddgResults;
        }

        // If DDG returned few or 0 results, query Wikipedia
        const wikiResults = await searchWikipedia(clean, 3);
        const combined = [...ddgResults, ...wikiResults];
        return combined.slice(0, maxResults);
    } catch (err) {
        console.warn('[Web Search Error]:', err.message);
        return [];
    }
}

/**
 * Detects if a message is an explicit search request
 */
function detectSearchIntent(text) {
    if (!text) return null;
    const clean = text.trim();

    // 1. Explicit search commands
    let m = clean.match(/^(?:\/search|\/google|\/find)\s+(.+)$/i);
    if (m) return m[1].trim();

    // 2. Banglish search phrases (check before generic English words)
    m = clean.match(/^(?:google\s+e\s+(?:search\s+koro|dekho|khujo)|net\s+e\s+(?:search\s+koro|dekho|khujo)|search\s+koro|khuje\s+dekho|khuje\s+bolo)\s*[:,\-]?\s+(.+)$/i);
    if (m) return m[1].trim();

    m = clean.match(/^(.+?)\s*[,.-]?\s*(?:google\s+e\s+search\s+koro|google\s+e\s+dekho|search\s+koro|google\s+koro)\s*$/i);
    if (m) return m[1].trim();

    // 3. English search phrases
    m = clean.match(/^(?:please\s+)?(?:search\s+(?:google\s+for|on\s+google\s+for|google|the\s+web\s+for|the\s+internet\s+for|for)?|search\s+about|google\s+search|google|look\s+up|find\s+out\s+about)\s*[:,\-]?\s+(.+)$/i);
    if (m && m[1].trim().length > 2) {
        const q = m[1].trim();
        // Avoid matching "search jobs" which goes to job radar
        if (!q.toLowerCase().startsWith('job')) return q;
    }

    // 4. Questions explicitly asking "what is the latest ...", "who won ...", "today news about ..."
    const isCurrentEventOrGeneralKnowledge = 
        clean.match(/^(?:what\s+is\s+the\s+latest|who\s+won|what\s+happened\s+(?:today|recently|yesterday)|current\s+price\s+of|latest\s+update\s+on)\s+(.+)$/i);
    if (isCurrentEventOrGeneralKnowledge) {
        return clean;
    }

    return null;
}

module.exports = {
    searchWeb,
    detectSearchIntent,
    cleanHtmlText
};
