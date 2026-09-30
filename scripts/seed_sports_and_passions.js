// scripts/seed_sports_and_passions.js
// Seeds Swapnil's Sports, Teams (FC Barcelona, Brazil), Football Playing, Cricket, and News Passions into Supabase

const { supabaseRequest } = require('../actions_handler');

async function main() {
    console.log('--- Seeding Swapnil Sports, News & Passions into Supabase ---');

    // 1. Update Profile Table with Sports, Passions, and Location
    try {
        const profiles = await supabaseRequest('/profiles?select=*', 'GET');
        if (profiles && profiles.length > 0) {
            const profile = profiles[0];
            const updatedMetadata = {
                ...(profile.metadata || {}),
                favorite_football_club: 'FC Barcelona (Barça)',
                favorite_national_team: 'Brazil (Seleção)',
                plays_football: true,
                favorite_sports: ['Football', 'Cricket'],
                interests: [
                    'Playing Football',
                    'Watching News',
                    'FC Barcelona & La Liga / Champions League',
                    'Brazil National Football Team',
                    'Cricket (Bangladesh & Global)',
                    'AI Product Engineering',
                    'Frontend & UI/UX Design'
                ]
            };

            await supabaseRequest(`/profiles?id=eq.${profile.id}`, 'PATCH', {
                location: profile.location || 'Dhaka',
                country: profile.country || 'Bangladesh',
                metadata: updatedMetadata,
                updated_at: new Date().toISOString()
            });
            console.log('✅ Profile table updated with sports, passions, and location.');
        }
    } catch (e) {
        console.warn('Profile update warning:', e.message);
    }

    // 2. Upsert Current State for Sports & Passions
    try {
        const sportsState = {
            favorite_club: 'FC Barcelona',
            club_nickname: 'Barça / Blaugrana',
            favorite_national_team: 'Brazil',
            national_team_nickname: 'Seleção / Canarinho',
            plays_football: true,
            cricket_interest: 'Bangladesh National Cricket Team, ICC Tournaments, Live Cricket Scores',
            news_interest: 'Watching news regularly, World events, Tech journalism, Sports news',
            updated_at: new Date().toISOString()
        };

        await supabaseRequest('/current_state', 'POST', {
            area: 'personal_passions',
            key: 'swapnil_sports_and_passions',
            value: sportsState,
            status: 'active'
        }).catch(async (err) => {
            if (err.message && (err.message.includes('409') || err.message.includes('duplicate'))) {
                return await supabaseRequest('/current_state?key=eq.swapnil_sports_and_passions', 'PATCH', {
                    value: sportsState,
                    updated_at: new Date().toISOString()
                });
            }
        });
        console.log('✅ Current state (swapnil_sports_and_passions) upserted.');
    } catch (e) {
        console.warn('Current state sports update warning:', e.message);
    }

    // 3. Upsert Default Location State if not already present
    try {
        const locRes = await supabaseRequest('/current_state?key=eq.swapnil_current_location', 'GET');
        if (!locRes || locRes.length === 0) {
            await supabaseRequest('/current_state', 'POST', {
                area: 'location',
                key: 'swapnil_current_location',
                value: {
                    city: 'Dhaka',
                    country: 'Bangladesh',
                    latitude: 23.8103,
                    longitude: 90.4125,
                    timezone: 'Asia/Dhaka',
                    source: 'default_anchor',
                    updated_at: new Date().toISOString()
                },
                status: 'active'
            });
            console.log('✅ Default location state (Dhaka, Bangladesh) seeded.');
        } else {
            console.log('✅ Existing location state verified.');
        }
    } catch (e) {
        console.warn('Location state seed warning:', e.message);
    }

    // 4. Seed Permanent Memories
    const targetMemories = [
        {
            content: "Swapnil's supported football club is FC Barcelona (Barça). He is a passionate Culér, following every match, La Liga, Champions League, squad news, and El Clásico.",
            memory_type: 'preference',
            importance: 10,
            status: 'active'
        },
        {
            content: "Swapnil's supported national football team is Brazil (Seleção). He is a die-hard Brazil supporter in the World Cup, Copa América, and international football.",
            memory_type: 'preference',
            importance: 10,
            status: 'active'
        },
        {
            content: "Swapnil genuinely loves playing football in real life. He is an active player on the pitch, not just a spectator.",
            memory_type: 'fact',
            importance: 9,
            status: 'active'
        },
        {
            content: "Swapnil loves watching news regularly, following breaking world affairs, tech breakthroughs, and sports journalism.",
            memory_type: 'preference',
            importance: 8,
            status: 'active'
        },
        {
            content: "Swapnil passionately follows cricket, especially the Bangladesh national cricket team (Tigers), live match scores, and ICC tournaments.",
            memory_type: 'preference',
            importance: 9,
            status: 'active'
        }
    ];

    try {
        const existingMemories = await supabaseRequest('/memories?status=eq.active&select=content', 'GET').catch(() => []);
        const existingContents = new Set((existingMemories || []).map(m => m.content.toLowerCase()));

        for (const mem of targetMemories) {
            const alreadyExists = Array.from(existingContents).some(c => 
                (c.includes('barcelona') && mem.content.toLowerCase().includes('barcelona')) ||
                (c.includes('brazil') && mem.content.toLowerCase().includes('brazil')) ||
                (c.includes('playing football') && mem.content.toLowerCase().includes('playing football')) ||
                (c.includes('cricket') && mem.content.toLowerCase().includes('cricket')) ||
                (c.includes('watching news') && mem.content.toLowerCase().includes('watching news'))
            );

            if (!alreadyExists) {
                await supabaseRequest('/memories', 'POST', mem);
                console.log(`✅ Seeded memory: "${mem.content.slice(0, 50)}..."`);
            } else {
                console.log(`ℹ️ Memory already present: "${mem.content.slice(0, 50)}..."`);
            }
        }
    } catch (e) {
        console.warn('Memory seeding warning:', e.message);
    }

    console.log('🎉 Successfully seeded sports, news, and passions into Mikasa memory vault!');
}

main().catch(err => {
    console.error('Fatal seeding error:', err);
    process.exit(1);
});
