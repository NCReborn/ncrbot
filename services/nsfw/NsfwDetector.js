const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger'); // adjust path if needed
const config = require('../../config/nsfwConfig.json');

// Helper: pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class NsfwDetector {
    constructor() {
        this.config = config;
        // List of API endpoints to try in order (primary first, then fallbacks)
        this.apis = [
            {
                url: 'https://nsfwjs.dooo.ng/classify',
                name: 'NSFWJS Public API',
                transform: (data) => data // already in {className, probability} format
            },
            // ─────────────────────────────────────────────────────────────
            // 🔧 FALLBACK API – Replace with a real working endpoint.
            // You can find free alternatives like:
            //   https://nsfw-checker.herokuapp.com/classify
            //   https://nsfw-image-classifier.vercel.app/api/classify
            //   Or self‑host your own (see NSFWJS docs)
            // ─────────────────────────────────────────────────────────────
            {
                url: 'https://your-fallback-api.com/classify', // <-- REPLACE THIS
                name: 'Fallback API',
                transform: (data) => {
                    // Example transformation if the fallback returns different format
                    // e.g., { results: [{ label: "hentai", confidence: 0.95 }] }
                    // Map to standard { className, probability }
                    if (data && Array.isArray(data.results)) {
                        return data.results.map(r => ({
                            className: r.label.charAt(0).toUpperCase() + r.label.slice(1),
                            probability: r.confidence
                        }));
                    }
                    throw new Error('Unexpected response format from fallback API');
                }
            }
        ];
    }

    // Dummy initialize for compatibility with old code
    async initialize() {
        logger.info('[NSFW] External API detector ready (no local models)');
    }

    /**
     * Compatibility method: accepts a URL, fetches the image, computes hash,
     * then calls classifyImageFromBuffer.
     */
    async classifyImage(url) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000
            });
            const imageBuffer = Buffer.from(response.data);
            const hash = crypto.createHash('md5').update(imageBuffer).digest('hex');
            return await this.classifyImageFromBuffer(imageBuffer, hash);
        } catch (error) {
            logger.error(`[NSFW] Failed to fetch URL ${url}: ${error.message}`);
            return this.getErrorResponse('fetch_error', error.message);
        }
    }

    /**
     * Core method – tries each API in sequence with retry logic.
     * @param {Buffer} imageBuffer
     * @param {string} hash
     * @returns {Promise<Object>}
     */
    async classifyImageFromBuffer(imageBuffer, hash) {
        const base64Image = imageBuffer.toString('base64');

        for (let attempt = 1; attempt <= this.config.maxRetries || 2; attempt++) {
            for (const api of this.apis) {
                try {
                    const response = await axios.post(api.url, { image: base64Image }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: this.config.timeout || 10000
                    });

                    // Transform response to standard format {className, probability}[]
                    let predictions;
                    try {
                        predictions = api.transform(response.data);
                    } catch (transformErr) {
                        logger.warn(`[NSFW] Transform error on ${api.name}: ${transformErr.message}`);
                        continue; // try next API
                    }

                    // Validate predictions array
                    if (!Array.isArray(predictions) || predictions.length === 0) {
                        throw new Error('Invalid predictions array');
                    }

                    const nsfwScore = this.calculateNsfwScore(predictions);
                    const confidenceLevel = this.getConfidenceLevel(nsfwScore);
                    const topPred = predictions[0];

                    logger.info(`[NSFW] ✅ ${api.name} | ${topPred.className} = ${(topPred.probability * 100).toFixed(1)}% | Score: ${nsfwScore.toFixed(2)} | Level: ${confidenceLevel}`);

                    return {
                        predictions,
                        hash,
                        skipped: false,
                        confidenceLevel,
                        nsfwScore,
                        modelUsed: api.name,
                        error: null
                    };
                } catch (error) {
                    logger.warn(`[NSFW] ❌ ${api.name} failed (attempt ${attempt}): ${error.message}`);
                    // Continue to next API or next attempt
                }
            }
            // If all APIs failed this attempt, wait before retrying (exponential backoff)
            if (attempt < (this.config.maxRetries || 2)) {
                const waitMs = Math.min(1000 * Math.pow(2, attempt), 10000);
                logger.info(`[NSFW] Retrying in ${waitMs}ms...`);
                await sleep(waitMs);
            }
        }

        // All attempts exhausted
        logger.error(`[NSFW] All APIs failed for hash ${hash}`);
        return this.getErrorResponse('all_apis_failed', 'All NSFW APIs are currently unavailable');
    }

    /**
     * Returns a safe "skip" response when detection fails.
     */
    getErrorResponse(code, message) {
        return {
            predictions: [],
            skipped: true,
            confidenceLevel: 'safe',
            nsfwScore: 0,
            modelUsed: 'none',
            error: { code, message }
        };
    }

    /**
     * Calculate a combined NSFW score from predictions.
     * Standard classes: Hentai, Porn, Sexy, Neutral, Drawing
     */
    calculateNsfwScore(predictions) {
        const mapping = {
            'Hentai': 1.0,
            'Porn': 1.0,
            'Sexy': 0.8,
            'Neutral': 0.0,
            'Drawing': 0.1
        };
        let score = 0;
        for (const pred of predictions) {
            const weight = mapping[pred.className] || 0;
            score += pred.probability * weight;
        }
        return Math.min(score, 1);
    }

    /**
     * Map numeric score to high/medium/safe based on config thresholds.
     */
    getConfidenceLevel(score) {
        const { high, medium } = this.config.thresholds;
        if (score > high) return 'high';
        if (score > medium) return 'medium';
        return 'safe';
    }

    /**
     * Check if a channel is monitored for NSFW scanning.
     * Reads from config.monitoredChannels (array of channel IDs).
     */
    isMonitoredChannel(channelId) {
        if (!this.config.monitoredChannels) return false;
        return this.config.monitoredChannels.includes(channelId);
    }
}

module.exports = new NsfwDetector();
