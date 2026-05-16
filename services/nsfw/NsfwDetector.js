const nsfwjs = require('nsfwjs');
const { createCanvas, loadImage } = require('canvas');
const logger = require('../../utils/logger'); // adjust path to your logger
const config = require('../../config/nsfwConfig.json');

class NsfwDetector {
    constructor() {
        this.model = null;
        this.config = config;
        this.initialized = false;
    }

    /**
     * Loads the nsfwjs model with InceptionV3 (better for anime/stylized images)
     */
    async initialize() {
        if (this.initialized) return;

        try {
            logger.info('[NSFW] Loading InceptionV3 model (better for anime/Cyberpunk)...');
            // 'InceptionV3' is a built-in option in nsfwjs – no extra download needed
            this.model = await nsfwjs.load('InceptionV3');
            logger.info('[NSFW] InceptionV3 model loaded successfully');
            this.initialized = true;
        } catch (err) {
            logger.error('[NSFW] Failed to load InceptionV3, falling back to default MobileNet:', err.message);
            // Fallback to default model if InceptionV3 fails
            this.model = await nsfwjs.load();
            this.initialized = true;
            logger.info('[NSFW] Default MobileNet model loaded as fallback');
        }
    }

    /**
     * Main classification method – processes an image buffer and returns results.
     * @param {Buffer} imageBuffer - Raw image data from Discord attachment
     * @param {string} hash - Unique hash of the image (for caching)
     * @returns {Promise<Object>} Classification result
     */
    async classifyImage(imageBuffer, hash) {
        await this.initialize();

        try {
            // Convert buffer to a canvas (what nsfwjs expects)
            const image = await loadImage(imageBuffer);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, image.width, image.height);

            // Run classification
            const predictions = await this.model.classify(canvas);
            const nsfwScore = this.calculateNsfwScore(predictions);
            const confidenceLevel = this.getConfidenceLevel(nsfwScore);

            // Log the top prediction for debugging
            const topPred = predictions[0];
            logger.info(`[NSFW] Top: ${topPred.className} = ${(topPred.probability * 100).toFixed(1)}% | Score: ${nsfwScore.toFixed(2)} | Level: ${confidenceLevel}`);

            return {
                predictions: predictions,
                hash: hash,
                skipped: false,
                confidenceLevel: confidenceLevel,
                nsfwScore: nsfwScore,
                modelUsed: 'InceptionV3'
            };
        } catch (error) {
            logger.error(`[NSFW] Classification failed for hash ${hash}: ${error.message}`);
            return {
                predictions: [],
                hash: hash,
                skipped: true,
                confidenceLevel: 'safe',
                nsfwScore: 0,
                modelUsed: 'none',
                error: error.message
            };
        }
    }

    /**
     * Calculate a combined NSFW score from the model's predictions.
     * The model returns: ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy']
     * @param {Array} predictions - Array of {className, probability}
     * @returns {number} Weighted score between 0 and 1
     */
    calculateNsfwScore(predictions) {
        const mapping = {
            'Hentai': 1.0,    // Explicit anime NSFW
            'Porn': 1.0,      // Real explicit
            'Sexy': 0.8,      // Suggestive but not explicit
            'Neutral': 0.0,
            'Drawing': 0.1    // Non-explicit anime/drawing – low risk
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
     * @param {number} score - NSFW score between 0 and 1
     * @returns {string} 'high', 'medium', or 'safe'
     */
    getConfidenceLevel(score) {
        const { high, medium } = this.config.thresholds;
        if (score > high) return 'high';
        if (score > medium) return 'medium';
        return 'safe';
    }

    /**
     * Optional: Clear the model (if you need to reload later, e.g., after config change)
     */
    async unload() {
        this.model = null;
        this.initialized = false;
        logger.info('[NSFW] Detector unloaded');
    }
}

module.exports = new NsfwDetector();
