const https = require('https');

function fetchLinkedInJobs(keywords = 'Software Engineer', location = 'Dhaka') {
    return new Promise((resolve) => {
        const query = encodeURIComponent(keywords);
        const loc = encodeURIComponent(location);
        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}&location=${loc}&sortBy=DD&start=0`;

        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, (res) => {
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                const jobs = [];
                // Split by list items or search cards
                const items = html.split('</li>');
                for (const item of items) {
                    if (!item.includes('job-search-card')) continue;

                    const titleMatch = item.match(/<h3 class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/i);
                    const companyMatch = item.match(/<h4 class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i);
                    const locMatch = item.match(/<span class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i);
                    const linkMatch = item.match(/href="([^"]+)"/i);
                    const dateMatch = item.match(/<time class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/i);

                    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : null;
                    const company = companyMatch ? companyMatch[1].replace(/<[^>]+>/g, '').trim() : 'Company';
                    const jobLoc = locMatch ? locMatch[1].replace(/<[^>]+>/g, '').trim() : location;
                    let cleanUrl = linkMatch ? linkMatch[1].split('?')[0] : null;

                    if (title && cleanUrl) {
                        jobs.push({
                            title,
                            company,
                            location: jobLoc,
                            url: cleanUrl,
                            posted: dateMatch ? dateMatch[2].replace(/<[^>]+>/g, '').trim() : 'Recent'
                        });
                    }
                    if (jobs.length >= 6) break;
                }
                resolve(jobs);
            });
        });

        req.on('error', (err) => {
            console.error('Jobs fetch error:', err.message);
            resolve([]);
        });
    });
}

fetchLinkedInJobs('Frontend Developer', 'Dhaka').then(jobs => {
    console.log(`Found ${jobs.length} jobs:`);
    console.log(JSON.stringify(jobs, null, 2));
});
