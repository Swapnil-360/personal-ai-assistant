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

function synthesizeGeminiVoice(text, voiceName = 'Kore') {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return Promise.reject(new Error('GEMINI_API_KEY not configured'));

    return new Promise((resolve, reject) => {
        const ttsPrompt = `Read the following text directly as audio: ${text}`;
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
                    resolve(wav);
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
    synthesizeGeminiVoice
};
