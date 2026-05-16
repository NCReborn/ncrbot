const axios = require('axios');
const logger = require('../../utils/logger'); // adjust path
const config = require('../../config/nsfwConfig.json');

// Optional: keep a local model as emergency fallback (comment out to save memory)
// const nsfwjs = require('nsfwjs');
// const { createCanvas, loadImage } = require('canvas');

class NsfwDetector {
    constructor() {
        this.config = config;
        this.localModel = null; // only if you want fallback
    }

    /**
     * Primary detection: uses free external API (no local memory usage)
     */
    async classifyImage(imageBuffer, hash) {
        // Try external API first
        try {
            const result = await this.classifyWithExternalApi(imageBuffer, hash);
            if (result) return result;
        } catch (err) {
            logger.warn(`[NSFW] External API failed: ${err.message}`);
        }

        // Fallback to local model (optional – comment out if you want zero memory risk)
        return this.classifyWithLocalModel(imageBuffer, hash);
    }

    /**
     * External API method – this is the main one you'll use
     */
    async classifyWithExternalApi(imageBuffer, hash) {
        try {
            // Convert buffer to base64
            const base64Image = imageBuffer.toString('base64');

            const response = await axios.post('https://nsfwjs.dooo.ng/classify', {
                image: base64Image
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            // API returns: [{ className: "Hentai", probability: 0.95 }, ...]
            const predictions = response.data;
            const nsfwScore = this.calculateNsfwScoreFromApi(predictions);
            const confidenceLevel = this.getConfidenceLevel(nsfwScore);

            const topPred = predictions[0];
            logger.info(`[NSFW] API: ${topPred.className} = ${(topPred.probability * 100).toFixed(1)}% | Score: ${nsfwScore.toFixed(2)} | Level: ${confidenceLevel}`);

            return {
                predictions: predictions,
                hash: hash,
                skipped: false,
                confidenceLevel: confidenceLevel,
                nsfwScore: nsfwScore,
                modelUsed: 'external-api'
            };
        } catch (error) {
            logger.error(`[NSFW] External API error: ${error.message}`);
            return null;
        }
    }

    /**
     * Score calculation for API results (same categories as local model)
     */
    calculateNsfwScoreFromApi(predictions) {
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
     * (Optional) Local fallback – only if you want a safety net.
     * Remove this entirely if you want zero memory usage.
     */
    async classifyWithLocalModel(imageBuffer, hash) {
        // Only load local model if absolutely needed (will spike memory once)
        if (!this.localModel) {
            try {
                logger.warn('[NSFW] Loading local fallback model (may cause memory spike)');
                const nsfwjs = require('nsfwjs');
                const { createCanvas, loadImage } = require('canvas');
                this.localModel = await nsfwjs.load(); // default MobileNetV1 (lightest)
                logger.info('[NSFW] Local fallback ready');
            } catch (err) {
                logger.error('[NSFW] Cannot load local model:', err.message);
                return {
                    predictions: [],
                    hash,
                    skipped: true,
                    confidenceLevel: 'safe',
                    nsfwScore: 0,
                    modelUsed: 'none',
                    error: err.message
                };
            }
        }

        try {
            const { createCanvas, loadImage } = require('canvas');
            const image = await loadImage(imageBuffer);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, image.width, image.height);
            const predictions = await this.localModel.classify(canvas);
            const nsfwScore = this.calculateNsfwScoreFromApi(predictions);
            const confidenceLevel = this.getConfidenceLevel(nsfwScore);
            return {
                predictions,
                hash,
                skipped: false,
                confidenceLevel,
                nsfwScore,
                modelUsed: 'local-fallback'
            };
        } catch (err) {
            logger.error(`[NSFW] Local fallback failed: ${err.message}`);
            return null;
        }
    }

    getConfidenceLevel(score) {
        const { high, medium } = this.config.thresholds;
        if (score > high) return 'high';
        if (score > medium) return 'medium';
        return 'safe';
    }
}

module.exports = new NsfwDetector();
