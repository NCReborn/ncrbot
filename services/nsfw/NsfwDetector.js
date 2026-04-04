const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class NsfwDetector {
  constructor() {
    this.model = null;
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
      return { enabled: false, monitoredChannels: [], thresholds: { high: 0.85, medium: 0.50 } };
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
   * Load the nsfwjs model. Call once at bot startup.
   */
  async initialize() {
    try {
      logger.info('[NSFW] Loading NSFW model...');
      this.model = await nsfwjs.load();
      logger.info('[NSFW] Model loaded successfully');
    } catch (error) {
      logger.error('[NSFW] Failed to load NSFW model:', error);
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
   * Download and classify an image URL.
   * @returns {{ predictions, hash, skipped, confidenceLevel } | null}
   */
  async classifyImage(imageUrl) {
    if (!this.model) {
      logger.warn('[NSFW] Model not loaded, skipping classification');
      return null;
    }

    let imageBuffer;
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxContentLength: 10 * 1024 * 1024, // 10 MB cap
      });
      imageBuffer = Buffer.from(response.data);
    } catch (error) {
      logger.error(`[NSFW] Failed to download image ${imageUrl}: ${error.message}`);
      return null;
    }

    const hash = this.computeImageHash(imageBuffer);

    if (this.isWhitelisted(hash)) {
      logger.info(`[NSFW] Image ${hash} is whitelisted, skipping`);
      return { skipped: true, hash, predictions: null, confidenceLevel: 'safe' };
    }

    let imageTensor;
    try {
      const image = await loadImage(imageBuffer);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      imageTensor = tf.browser.fromPixels({
        data: imageData.data,
        width: canvas.width,
        height: canvas.height,
      }, 3);
      const predictions = await this.model.classify(imageTensor);
      const confidenceLevel = this.getConfidenceLevel(predictions);
      return { predictions, hash, skipped: false, confidenceLevel };
    } catch (error) {
      logger.error(`[NSFW] Failed to classify image ${imageUrl}: ${error.message}`);
      return null;
    } finally {
      if (imageTensor) imageTensor.dispose();
    }
  }

  /**
   * Determine confidence level from nsfwjs prediction results.
   * @param {Array<{className: string, probability: number}>} predictions
   * @returns {'high' | 'medium' | 'safe'}
   */
  getConfidenceLevel(predictions) {
    const { high, medium } = this.config.thresholds;

    const score = (name) =>
      predictions.find((p) => p.className === name)?.probability ?? 0;

    const porn = score('Porn');
    const hentai = score('Hentai');
    const sexy = score('Sexy');

    if (porn > high || hentai > high) return 'high';
    if (porn > medium || hentai > medium || sexy > medium) return 'medium';
    return 'safe';
  }

  isMonitoredChannel(channelId) {
    return this.config.enabled && this.config.monitoredChannels.includes(channelId);
  }
}

module.exports = new NsfwDetector();
