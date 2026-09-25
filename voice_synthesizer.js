const https = require('https');
const fs = require('fs');
const path = require('path');

function getGeminiApiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(/GEMINI_API_KEY=([^\r\n]+)/);
            if (match) return match[1].trim();
        }
    } catch (e) {}
    return null;
}

function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitDepth = 16) {
    const dataLen = pcmBuffer.length;
    const buffer = Buffer.alloc(44 + dataLen);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLen, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitDepth / 8), 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLen, 40);
    pcmBuffer.copy(buffer, 44);
    return buffer;
}

function stripEmojis(text) {
    if (!text) return '';
    return text
        .replace(/[\p{Extended_Pictographic}\u200d\ufe0f\u203c-\u3299\u{1f000}-\u{1f9ff}]/gu, '')
        .replace(/[*_#`~\[\]\(\)\{\}\<\>\\\/|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Convert any Banglish or Bengali text into natural, sweet spoken English for clean TTS
async function toSpokenEnglish(text) {
    if (!text || !text.trim()) return '';
    const clean = stripEmojis(text);
    if (!clean) return '';

    // Check if text contains non-English / Banglish / Bengali patterns
    const hasBengali = /[\u0980-\u09FF]/.test(clean);
    const hasBanglishWords = /\b(?:ami|tumi|apni|amake|tomake|amar|tomar|kemon|acho|achen|achhen|ache|ase|shob|sob|ekhane|koro|korcho|korchi|kora|korba|korben|korecho|korar|bolo|bolte|bolchi|bolba|parbo|parbe|hobe|khete|dekho|dekhbo|shunba|shunar|shunte|jonno|bhalo|valo|kharap|khobor|obostha|obsta|chaile|shamil|eita|eta|eti|ota|oita|kalke|agamikal|rate|shokal|ekhon|ekhankar|tai|ki|baire|ber|howar|howa|thanda|mathay|lagbe|naki|darun|bepar|boshe|bose|thako|shune|ar|aar|o|oi|kon|keno|kivabe|kibhabe|koi|jabo|jacchi|gecho|gechi|ashbo|asho|dhaka|dhakar|bangla|banglish)\b/i.test(clean);
    const hasBanglaSuffix = /[a-z]+-(?:r|e|te|er)\b/i.test(clean);

    if (!hasBengali && !hasBanglishWords && !hasBanglaSuffix) {
        return clean;
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) return clean;

    try {
        const payload = JSON.stringify({
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: 'You are Mikasa speaking directly to Swapnil. Translate and rephrase this Banglish/Bengali text into short, natural, warm spoken English for voice output. Do NOT include any emojis or markdown symbols. Return ONLY the spoken English sentence without commentary or quotes:\n\n' + clean
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 100
            }
        });

        const translated = await new Promise((resolve) => {
            const req = https.request({
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 7000
            }, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => {
                    try {
                        const j = JSON.parse(d);
                        const out = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                        resolve(stripEmojis(out || clean));
                    } catch (e) {
                        resolve(clean);
                    }
                });
            });
            req.on('error', () => resolve(clean));
            req.on('timeout', () => { req.destroy(); resolve(clean); });
            req.write(payload);
            req.end();
        });

        return stripEmojis(translated || clean);
    } catch (e) {
        return clean;
    }
}

async function callSingleTtsModel(modelName, speechText, voiceName, apiKey) {
    return new Promise((resolve, reject) => {
        const ttsPrompt = `Read the following text directly as audio: ${speechText}`;
        const payload = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: ttsPrompt }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voiceName
                        }
                    }
                }
            }
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 12000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        return reject(new Error(json.error.message || `TTS error on ${modelName}`));
                    }
                    const base64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                    if (!base64) {
                        return reject(new Error(`No audio data returned from ${modelName}`));
                    }
                    const pcm = Buffer.from(base64, 'base64');
                    const wav = pcmToWav(pcm, 24000, 1, 16);
                    resolve({ wav, speechText, model: modelName });
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Gemini TTS timed out on ${modelName}`));
        });
        req.write(payload);
        req.end();
    });
}

async function synthesizeGeminiVoice(text, voiceName = 'Kore') {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return Promise.reject(new Error('GEMINI_API_KEY not configured'));

    // Convert Banglish to spoken English so speech synthesis sounds fluent, sweet, and human
    const speechText = await toSpokenEnglish(text);
    if (!speechText) return Promise.reject(new Error('No speech text available'));

    // Multi-model fallback list with Gemini 3.8 as top priority
    const models = [
        'gemini-3.8-flash-lite-tts',
        'gemini-3.8-flash-tts',
        'gemini-3.1-flash-tts-preview'
    ];

    let lastError = null;
    for (const model of models) {
        try {
            const result = await callSingleTtsModel(model, speechText, voiceName, apiKey);
            return result;
        } catch (err) {
            console.warn(`[Gemini TTS ${model} failed, trying next fallback]:`, err.message);
            lastError = err;
        }
    }

    throw (lastError || new Error('All Gemini TTS models failed'));
}

module.exports = {
    getGeminiApiKey,
    pcmToWav,
    stripEmojis,
    toSpokenEnglish,
    synthesizeGeminiVoice
};
