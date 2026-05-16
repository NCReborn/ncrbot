const nsfwjs = require('nsfwjs');
const { pipeline } = require('@huggingface/transformers');
const { createCanvas, loadImage } = require('canvas');
const logger = require('../../utils/logger'); // adjust path to your logger
const config = require('../../config/nsfwConfig.json');

class NsfwDetector {
    constructor() {
        this.model = null;
        this.animeModel = null;      // will hold Hugging Face pipeline
        this.config = config;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        // 1. Load general nsfwjs model (fallback)
        try {
            logger.info('[NSFW] Loading nsfwjs model...');
            this.model = await nsfwjs.load();
            logger.info('[NSFW] nsfwjs model loaded');
        } catch (err) {
            logger.error('[NSFW] Failed to load nsfwjs model:', err);
            throw err;
        }

        // 2. Load Hugging Face anime-specific model
        if (this.config.useAnimeModel) {
            try {
                logger.info('[NSFW] Loading prithivMLmods/Mature-Content-Detection...');
                // This pipeline returns an array of { label, score }
                this.animeModel = await pipeline('image-classification', 'prithivMLmods/Mature-Content-Detection');
                logger.info('[NSFW] Mature-Content-Detection model ready');
            } catch (err) {
                logger.warn('[NSFW] Failed to load anime model, will use only nsfwjs:', err.message);
                this.animeModel = null;
            }
        }

        this.initialized = true;
    }

    /**
     * Main classification method – uses anime model first, then falls back to nsfwjs.
     */
    async classifyImage(imageBuffer, hash) {
        await this.initialize();

        // Try anime model first if available
        if (this.animeModel && this.config.useAnimeModel) {
            const result = await this.classifyWithAnimeModel(imageBuffer, hash);
            if (result && !result.skipped) {
                return result;
            }
        }

        // Fallback to nsfwjs
        return this.classifyWithNsfwjs(imageBuffer, hash);
    }

    /**
     * NEW: Classification using Hugging Face mature-content-detection model.
     */
    async classifyWithAnimeModel(imageBuffer, hash) {
        if (!this.animeModel) return null;

        try {
            // Convert buffer to a canvas element (what the pipeline expects)
            const image = await loadImage(imageBuffer);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, image.width, image.height);

            // Run inference – returns array like:
            // [{ label: "Hentai", score: 0.95 }, { label: "Pornography", score: 0.03 }, ...]
            const predictions = await this.animeModel(canvas);

            // Convert to your internal confidence levels
            const confidenceLevel = this.getConfidenceLevelFromHFPredictions(predictions);

            logger.info(`[NSFW] Anime model result: ${predictions[0].label} = ${(predictions[0].score * 100).toFixed(1)}%`);

            return {
                predictions: predictions,      // full raw output
                hash: hash,
                skipped: false,
                confidenceLevel: confidenceLevel,
                modelUsed: 'mature-content-detection'
            };
        } catch (error) {
            logger.error(`[NSFW] Anime model error: ${error.message}`);
            return null;  // fallback to nsfwjs
        }
    }

    /**
     * Original nsfwjs method (keep as is, but rename if needed).
     */
    async classifyWithNsfwjs(imageBuffer, hash) {
        try {
            const image = await loadImage(imageBuffer);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, image.width, image.height);

            const predictions = await this.model.classify(canvas);
            const nsfwScore = this.getNsfwScore(predictions);
            const confidenceLevel = this.getConfidenceLevel(nsfwScore);

            return {
                predictions: predictions,
                hash: hash,
                skipped: false,
                confidenceLevel: confidenceLevel,
                modelUsed: 'nsfwjs'
            };
        } catch (error) {
            logger.error(`[NSFW] nsfwjs error: ${error.message}`);
            return {
                predictions: [],
                hash: hash,
                skipped: true,
                confidenceLevel: 'safe',
                modelUsed: 'none',
                error: error.message
            };
        }
    }

    /**
     * Map the 5-class Hugging Face output to your high/medium/safe levels.
     * Expected labels: "Hentai", "Pornography", "Enticing or Sensual", "Sexy", "Neutral" (or "Safe")
     */
    getConfidenceLevelFromHFPredictions(predictions) {
        const { high, medium } = this.config.thresholds;

        // Helper to get score for a label
        const score = (label) => {
            const pred = predictions.find(p => p.label === label);
            return pred ? pred.score : 0;
        };

        const hentaiScore = score('Hentai');
        const pornScore = score('Pornography');
        const enticingScore = score('Enticing or Sensual');
        const sexyScore = score('Sexy');

        // High confidence if explicit hentai or porn above high threshold
        if (hentaiScore > high || pornScore > high) return 'high';

        // Medium confidence if:
        // - hentai/porn above medium threshold, OR
        // - "enticing" or "sexy" above high threshold (these are borderline)
        if (hentaiScore > medium || pornScore > medium || 
            enticingScore > high || sexyScore > high) {
            return 'medium';
        }

        return 'safe';
    }

    /**
     * Original nsfwjs scoring logic – keep yours, but here's a typical version.
     */
    getNsfwScore(predictions) {
        const nsfwCategories = ['Hentai', 'Porn', 'Sexy'];
        let score = 0;
        for (const pred of predictions) {
            if (nsfwCategories.includes(pred.className)) {
                score += pred.probability;
            }
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
