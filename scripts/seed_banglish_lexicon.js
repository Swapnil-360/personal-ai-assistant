// scripts/seed_banglish_lexicon.js
// Seeds Swapnil's Official Banglish Spelling & Transliteration Strategy into Supabase

const { supabaseRequest } = require('../actions_handler');

const BANGLISH_SPEC = {
    type: "language_style",
    language: "banglish",
    owner: "Swapnil",
    purpose: "Romanized Bangla spelling",
    rules: {
        preferred_spellings: {
            "আমি": "ami",
            "তুমি": "tumi",
            "এটা": "eta",
            "ওটা": "oita",
            "এখানে": "ekhane",
            "সেখানে": "shekhane",
            "এখন": "ekhon",
            "আগে": "age",
            "পরে": "pore",
            "তারপর": "tarpor",
            "হবে": "hobe",
            "হবে না": "hobe na",
            "করছি": "korchi",
            "করতেছি": "kortesi",
            "করতে হবে": "korte hobe",
            "করবো": "korbo",
            "করো": "koro",
            "করিস": "koris",
            "হচ্ছে": "hocche",
            "হয়েছে": "hoyeche",
            "হয়ে গেছে": "hoye geche",
            "লাগবে": "lagbe",
            "লাগতেছে": "lagtese",
            "চাই": "chai",
            "চাচ্ছি": "chacchi",
            "পারবো": "parbo",
            "পারি": "pari",
            "পারবে": "parbe",
            "বুঝি": "bujhi",
            "বুঝছি": "bujhtesi",
            "জানি": "jani",
            "জানি না": "jani na",
            "দেখি": "dekhi",
            "দেখো": "dekho",
            "বলো": "bolo",
            "শুনো": "shuno",
            "কেন": "keno",
            "কিভাবে": "kivabe",
            "কেননা": "karon",
            "কিন্তু": "kintu",
            "আর": "ar",
            "এবং": "ebong",
            "অনেক": "onek",
            "একদম": "ekdom",
            "আসলে": "ashole",
            "এখনো": "ekhono",
            "কিছু": "kichu",
            "সবাই": "shobai",
            "কোথায়": "kothay",
            "কী": "ki",
            "না": "na"
        },
        exemplar_dataset: [
            {
                bangla: "আমি এখন এটা করতে চাচ্ছি",
                swapnil: "ami ekhon eta korte chacchi"
            },
            {
                bangla: "এটা আগে ঠিক করি তারপর বাকি কাজ করবো",
                swapnil: "eta age thik kori tarpor baki kaj korbo"
            },
            {
                bangla: "এটা কেন কাজ করছে না?",
                swapnil: "eta keno kaj kortese na?"
            },
            {
                bangla: "তুমি এটা কিভাবে করলা?",
                swapnil: "tumi eta kivabe korla?"
            }
        ]
    }
};

async function main() {
    console.log('--- Anchoring Swapnil Official Banglish Lexicon into Supabase ---');

    // 1. Upsert into current_state
    try {
        console.log('1. Upserting into current_state (area: language_style, key: swapnil_banglish_lexicon)...');
        await supabaseRequest('/current_state', 'POST', {
            area: 'language_style',
            key: 'swapnil_banglish_lexicon',
            value: BANGLISH_SPEC,
            status: 'active'
        }).catch(async (err) => {
            if (err.message && (err.message.includes('409') || err.message.includes('duplicate'))) {
                return await supabaseRequest('/current_state?key=eq.swapnil_banglish_lexicon', 'PATCH', {
                    value: BANGLISH_SPEC,
                    status: 'active',
                    updated_at: new Date().toISOString()
                });
            }
            throw err;
        });
        console.log('✅ current_state successfully anchored with official Banglish lexicon.');
    } catch (e) {
        console.warn('⚠️ current_state error:', e.message);
    }

    // 2. Insert into memories table
    try {
        console.log('2. Inserting into memories table...');
        const memContent = "Swapnil's Official Banglish Transliteration Strategy: Mikasa must text in Latin Banglish when Swapnil texts in Banglish. Never use Bengali script unless explicitly asked. Always adhere strictly to Swapnil's preferred spellings: 'eta' (never 'eita'/'aita'), 'oita', 'kivabe' (never 'kibhabe'), 'ekhon' (never 'akhon'), 'ashole', 'ekdom', 'kortesi'/'korchi', 'chacchi'/'chaitesi'. Exemplar dataset pairs: 'ami ekhon eta korte chacchi', 'eta age thik kori tarpor baki kaj korbo', 'eta keno kaj kortese na?', 'tumi eta kivabe korla?'.";

        await supabaseRequest('/memories', 'POST', {
            content: memContent,
            memory_type: 'preference',
            importance: 10,
            status: 'active',
            created_at: new Date().toISOString()
        });
        console.log('✅ Core memory successfully stored.');
    } catch (e) {
        console.warn('⚠️ Memory store error:', e.message);
    }

    console.log('--- Banglish Lexicon Anchoring Complete! ---');
}

if (require.main === module) {
    main().catch(console.error);
}
