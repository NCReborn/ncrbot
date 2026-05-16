const nsfwjs = require('nsfwjs');
const { createCanvas, loadImage } = require('canvas');
const logger = require('../../utils/logger'); // adjust path as needed
const config = require('../../config/nsfwConfig.json');

class NsfwDetector {
    constructor() {
        this.model = null;
        this.config = config;
        this.initialized = false;
    }

    /**
     * Loads the nsfwjs model with MobileNetV2Mid (balanced memory/accuracy)
     * Using { type: 'graph' } is required for this model variant.
     */
    async initialize() {
        if (this.initialized) return;

        try {
            logger.info('[NSFW] Loading MobileNetV2Mid model (optimized for memory & anime detection)...');
            // 'MobileNetV2Mid' with graph type is memory-efficient and accurate
            this.model = await nsfwjs.load('MobileNetV2Mid', { type: 'graph' });
            logger.info('[NSFW] MobileNetV2Mid model loaded successfully');
            this.initialized = true;
        } catch (err) {
            logger.error('[NSFW] Failed to load MobileNetV2Mid, falling back to default MobileNetV1:', err.message);
            // Ultimate fallback to default model (smallest memory footprint)
            this.model = await nsfwjs.load();
            this.initialized = true;
            logger.info('[NSFW] Default MobileNetV1 model loaded as fallback');
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
                modelUsed: 'MobileNetV2Mid'
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
