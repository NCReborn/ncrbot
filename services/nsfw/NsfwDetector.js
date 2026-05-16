const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger'); // adjust path if needed
const config = require('../../config/nsfwConfig.json');

class NsfwDetector {
    constructor() {
        this.config = config;
    }

    // Dummy initialize for compatibility
    async initialize() {
        logger.info('[NSFW] External API detector ready');
    }

    /**
     * Compatibility method: accepts a URL, fetches the image, computes hash,
     * then calls the main classifyImage method.
     * @param {string} url - Direct image URL from Discord attachment
     * @returns {Promise<Object>}
     */
    async classifyImage(url) {
        try {
            // Fetch the image from Discord CDN
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000
            });
            const imageBuffer = Buffer.from(response.data);
            const hash = crypto.createHash('md5').update(imageBuffer).digest('hex');
            return this.classifyImageFromBuffer(imageBuffer, hash);
        } catch (error) {
            logger.error(`[NSFW] Failed to fetch URL ${url}: ${error.message}`);
            return {
                predictions: [],
                skipped: true,
                confidenceLevel: 'safe',
                nsfwScore: 0,
                modelUsed: 'none',
                error: error.message
            };
        }
    }

    /**
     * Core method – accepts a buffer and hash (used by the URL method above).
     * @param {Buffer} imageBuffer
     * @param {string} hash
     * @returns {Promise<Object>}
     */
    async classifyImageFromBuffer(imageBuffer, hash) {
        try {
            const base64Image = imageBuffer.toString('base64');
            const response = await axios.post('https://nsfwjs.dooo.ng/classify', {
                image: base64Image
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            const predictions = response.data;
            const nsfwScore = this.calculateNsfwScore(predictions);
            const confidenceLevel = this.getConfidenceLevel(nsfwScore);

            const topPred = predictions[0];
            logger.info(`[NSFW] API: ${topPred.className} = ${(topPred.probability * 100).toFixed(1)}% | Score: ${nsfwScore.toFixed(2)} | Level: ${confidenceLevel}`);

            return {
                predictions,
                hash,
                skipped: false,
                confidenceLevel,
                nsfwScore,
                modelUsed: 'external-api'
            };
        } catch (error) {
            logger.error(`[NSFW] API error for hash ${hash}: ${error.message}`);
            return {
                predictions: [],
                hash,
                skipped: true,
                confidenceLevel: 'safe',
                nsfwScore: 0,
                modelUsed: 'none',
                error: error.message
            };
        }
    }

    // Optional: method to check if channel is monitored (read from config)
    isMonitoredChannel(channelId) {
        return this.config.monitoredChannels?.includes(channelId) || false;
    }

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

    getConfidenceLevel(score) {
        const { high, medium } = this.config.thresholds;
        if (score > high) return 'high';
        if (score > medium) return 'medium';
        return 'safe';
    }
}

module.exports = new NsfwDetector();
