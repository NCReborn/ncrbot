const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

// Optional: For anime NSFW detection
let yolov8Anime = null;
try {
  yolov8Anime = require('yolov8-anime-nsfw');
} catch (e) {
  logger.warn('[NSFW] YOLOv8 Anime model not installed. Install with: npm install yolov8-anime-nsfw');
}

class NsfwDetector {
  constructor() {
    this.model = null;
    this.animeModel = null;
    this.configPath = path.join(__dirname, '../../config/nsfwConfig.json');
    this.whitelistPath = path.join(__dirname, '../../data/nsfwWhitelist.json');
    this.config = this.loadConfig();
    this.whitelist = this.loadWhitelist();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('[NSFW] Failed to load nsfwConfig.json:', error);
      return { 
        enabled: false, 
        monitoredChannels: [], 
        thresholds: { high: 0.85, medium: 0.50 },
        useAnimeModel: true // New option to enable anime detection
      };
    }
  }

  loadWhitelist() {
    try {
      if (fs.existsSync(this.whitelistPath)) {
        const data = fs.readFileSync(this.whitelistPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('[NSFW] Failed to load nsfwWhitelist.json:', error);
    }
    return [];
  }

  saveWhitelist() {
    try {
      fs.writeFileSync(this.whitelistPath, JSON.stringify(this.whitelist, null, 2));
    } catch (error) {
      logger.error('[NSFW] Failed to save nsfwWhitelist.json:', error);
    }
  }

  /**
   * Load NSFW models. Call once at bot startup.
   */
  async initialize() {
    try {
      logger.info('[NSFW] Loading NSFW models...');
      this.model = await nsfwjs.load();
      logger.info('[NSFW] nsfwjs model loaded successfully');

      // Try to load anime-specific model if enabled
      if (this.config.useAnimeModel && yolov8Anime) {
        try {
          this.animeModel = await yolov8Anime.load();
          logger.info('[NSFW] YOLOv8 Anime model loaded successfully');
        } catch (e) {
          logger.warn('[NSFW] Failed to load anime model, will use nsfwjs only:', e.message);
        }
      }
    } catch (error) {
      logger.error('[NSFW] Failed to load NSFW models:', error);
    }
  }

  /**
   * Compute an MD5 fingerprint from raw image bytes.
   */
  computeImageHash(imageBuffer) {
    return crypto.createHash('md5').update(imageBuffer).digest('hex');
  }

  isWhitelisted(hash) {
    return this.whitelist.includes(hash);
  }

  addToWhitelist(hash) {
    if (!this.whitelist.includes(hash)) {
      this.whitelist.push(hash);
      this.saveWhitelist();
      logger.info(`[NSFW] Added image hash ${hash} to whitelist`);
    }
  }

  /**
   * Download and classify an image URL using anime-specific model first.
   * Falls back to nsfwjs if anime model unavailable.
   * @returns {{ predictions, hash, skipped, confidenceLevel, modelUsed } | null}
   */
  async classifyImage(imageUrl) {
    if (!this.model && !this.animeModel) {
      logger.warn('[NSFW] No models loaded, skipping classification');
      return null;
    }

    let imageBuffer;
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxContentLength: 25 * 1024 * 1024,
      });
      imageBuffer = Buffer.from(response.data);
    } catch (error) {
      logger.error(`[NSFW] Failed to download image ${imageUrl}: ${error.message}`);
      return null;
    }

    const hash = this.computeImageHash(imageBuffer);

    if (this.isWhitelisted(hash)) {
      logger.info(`[NSFW] Image ${hash} is whitelisted, skipping`);
      return { skipped: true, hash, predictions: null, confidenceLevel: 'safe', modelUsed: 'whitelist' };
    }

    // Try anime model first if available
    if (this.animeModel) {
      try {
        const result = await this.classifyWithAnimeModel(imageBuffer, hash);
        if (result) return result;
      } catch (error) {
        logger.warn('[NSFW] Anime model classification failed, falling back to nsfwjs:', error.message);
      }
    }

    // Fallback to nsfwjs
    if (this.model) {
      try {
        return await this.classifyWithNsfwjs(imageBuffer, hash);
      } catch (error) {
        logger.error(`[NSFW] nsfwjs classification failed: ${error.message}`);
        return null;
      }
    }

    return null;
  }

  /**
   * Classify using YOLOv8 Anime NSFW model (optimized for game content)
   */
  async classifyWithAnimeModel(imageBuffer, hash) {
    let imageTensor;
    try {
      const image = await loadImage(imageBuffer);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      imageTensor = tf.browser.fromPixels({
        data: new Uint8Array(imageData.data.buffer),
        width: canvas.width,
        height: canvas.height,
      }, 3);

      const predictions = await this.animeModel.classify(imageTensor);
      const confidenceLevel = this.getAnimeConfidenceLevel(predictions);
      
      logger.info(`[NSFW] Anime model: ${predictions[0].className} (${(predictions[0].probability * 100).toFixed(1)}%)`);
      
      return { predictions, hash, skipped: false, confidenceLevel, modelUsed: 'yolov8_anime' };
    } catch (error) {
      logger.error(`[NSFW] Anime model classification failed: ${error.message}`);
      return null;
    } finally {
      if (imageTensor) imageTensor.dispose();
    }
  }

  /**
   * Classify using nsfwjs (fallback)
   */
  async classifyWithNsfwjs(imageBuffer, hash) {
    let imageTensor;
    try {
      const image = await loadImage(imageBuffer);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      imageTensor = tf.browser.fromPixels({
        data: new Uint8Array(imageData.data.buffer),
        width: canvas.width,
        height: canvas.height,
      }, 3);

      const predictions = await this.model.classify(imageTensor);
      const confidenceLevel = this.getNsfwjsConfidenceLevel(predictions);
      
      logger.info(`[NSFW] nsfwjs: ${predictions[0].className} (${(predictions[0].probability * 100).toFixed(1)}%)`);
      
      return { predictions, hash, skipped: false, confidenceLevel, modelUsed: 'nsfwjs' };
    } catch (error) {
      logger.error(`[NSFW] nsfwjs classification failed: ${error.message}`);
      return null;
    } finally {
      if (imageTensor) imageTensor.dispose();
    }
  }

  /**
   * Determine confidence level from YOLOv8 Anime predictions
   * Classes: [sfw, nsfw, questionable]
   */
  getAnimeConfidenceLevel(predictions) {
    const { high, medium } = this.config.thresholds;

    const score = (name) =>
      predictions.find((p) => p.className === name)?.probability ?? 0;

    const nsfw = score('nsfw');
    const questionable = score('questionable');

    if (nsfw > high) return 'high';
    if (nsfw > medium || questionable > high) return 'medium';
    return 'safe';
  }

  /**
   * Determine confidence level from nsfwjs predictions (excluding "Sexy")
   * Classes: [Porn, Hentai, Neutral, Drawing]
   */
  getNsfwjsConfidenceLevel(predictions) {
    const { high, medium } = this.config.thresholds;

    const score = (name) =>
      predictions.find((p) => p.className === name)?.probability ?? 0;

    const porn = score('Porn');
    const hentai = score('Hentai');
    // Removed Sexy - too many false positives

    if (porn > high || hentai > high) return 'high';
    if (porn > medium || hentai > medium) return 'medium';
    return 'safe';
  }

  isMonitoredChannel(channelId) {
    return this.config.enabled && this.config.monitoredChannels.includes(channelId);
  }
}

module.exports = new NsfwDetector();
