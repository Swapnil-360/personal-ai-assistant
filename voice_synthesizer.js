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

// Convert any Banglish or Bengali text into natural, sweet spoken English for clean TTS
async function toSpokenEnglish(text) {
    if (!text || !text.trim()) return '';
    const clean = text.replace(/[*_#`~\[\]\(\)]/g, ' ').replace(/\s+/g, ' ').trim();

    // Check if text contains non-English / Banglish / Bengali patterns
    const hasBengali = /[\u0980-\u09FF]/.test(clean);
    const hasBanglishWords = /\b(?:ami|tumi|amake|tomake|amar|tomar|kemon|acho|achhen|ache|shob|ekhane|koro|korba|korecho|bolo|bolte|parbo|hobe|khete|dekho|shunba|shunar|jonno|bhalo|kharap|khobor|obsta|chaile|shamil|eita|eta|kalke|agamikal|rate|shokal|ekhon|tai|hobe|korbo)\b/i.test(clean);

    if (!hasBengali && !hasBanglishWords) {
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
                            text: 'Translate this message into short, sweet, natural spoken English from Mikasa to Swapnil for text-to-speech voice output. Keep her devoted, caring companion tone. Return ONLY the spoken English sentence without quotes or commentary:\n\n' + clean
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 120
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
                        resolve(out || clean);
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

        return translated || clean;
    } catch (e) {
        return clean;
    }
}

async function synthesizeGeminiVoice(text, voiceName = 'Kore') {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return Promise.reject(new Error('GEMINI_API_KEY not configured'));

    // Convert Banglish to spoken English so speech synthesis sounds fluent and clear
    const speechText = await toSpokenEnglish(text);

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
            path: `/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
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
                    if (json.error) return reject(new Error(json.error.message || 'Gemini TTS error'));
                    const base64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                    if (!base64) return reject(new Error('No audio data returned'));
                    const pcm = Buffer.from(base64, 'base64');
                    const wav = pcmToWav(pcm, 24000, 1, 16);
                    resolve({ wav, speechText });
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Gemini TTS timed out'));
        });
        req.write(payload);
        req.end();
    });
}

module.exports = {
    getGeminiApiKey,
    pcmToWav,
    toSpokenEnglish,
    synthesizeGeminiVoice
};
