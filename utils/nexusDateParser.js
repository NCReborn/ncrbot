/**
 * Utility for parsing Nexus Mods comment date formats
 * Handles both relative dates (e.g., "2 hours ago", "3 days ago") 
 * and absolute dates (e.g., "12 Jan 2024")
 */

const logger = require('./logger');

/**
 * Parse Nexus Mods date string to JavaScript Date object
 * @param {string} dateStr - Date string from Nexus Mods
 * @returns {Date|null} - Parsed date or null if parsing failed
 */
function parseNexusDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim().toLowerCase();
  const now = new Date();

  try {
    // Handle relative dates (e.g., "2 hours ago", "3 days ago", "1 week ago")
    if (trimmed.includes('ago')) {
      return parseRelativeDate(trimmed, now);
    }

    // Handle "today" and "yesterday"
    if (trimmed === 'today') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    if (trimmed === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    }

    // Handle absolute dates (e.g., "12 Jan 2024", "12th January 2024")
    return parseAbsoluteDate(dateStr);

  } catch (error) {
    logger.warn(`Failed to parse Nexus date: "${dateStr}". Error: ${error.message}`);
    return null;
  }
}

/**
 * Parse relative date strings like "2 hours ago", "3 days ago"
 * @param {string} dateStr - Relative date string
 * @param {Date} baseDate - Base date to calculate from
 * @returns {Date} - Calculated date
 */
function parseRelativeDate(dateStr, baseDate) {
  const regex = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i;
  const match = dateStr.match(regex);
  
  if (!match) {
    throw new Error(`Unrecognized relative date format: ${dateStr}`);
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const date = new Date(baseDate);

  switch (unit) {
    case 'second':
      date.setSeconds(date.getSeconds() - amount);
      break;
    case 'minute':
      date.setMinutes(date.getMinutes() - amount);
      break;
    case 'hour':
      date.setHours(date.getHours() - amount);
      break;
    case 'day':
      date.setDate(date.getDate() - amount);
      break;
    case 'week':
      date.setDate(date.getDate() - (amount * 7));
      break;
    case 'month':
      date.setMonth(date.getMonth() - amount);
      break;
    case 'year':
      date.setFullYear(date.getFullYear() - amount);
      break;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }

  return date;
}

/**
 * Parse absolute date strings like "12 Jan 2024" or "12th January 2024"
 * @param {string} dateStr - Absolute date string
 * @returns {Date} - Parsed date
 */
function parseAbsoluteDate(dateStr) {
  // Remove ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
  const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  
  // Try different date formats that Nexus might use
  const formats = [
    // "12 Jan 2024", "12 January 2024"
    /(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{4})/i,
    // "Jan 12, 2024", "January 12, 2024"
    /(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{1,2}),?\s+(\d{4})/i,
    // "12/01/2024", "12-01-2024" (DD/MM/YYYY or MM/DD/YYYY - ambiguous) - check before ISO format
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
    // "2024-01-12", "2024/01/12" - ISO-like format with 4-digit year at start
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
  ];

  for (const format of formats) {
    const match = cleaned.match(format);
    if (match) {
      return parseDateFromMatch(match, format);
    }
  }

  // Fallback: try native Date parsing
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new Error(`Could not parse absolute date: ${dateStr}`);
}

/**
 * Parse date from regex match based on format
 * @param {Array} match - Regex match result
 * @param {RegExp} format - Format regex used
 * @returns {Date} - Parsed date
 */
function parseDateFromMatch(match, format) {
  const formatStr = format.source;

  if (formatStr.includes('jan|january')) {
    // Format: "12 Jan 2024" or "Jan 12, 2024"
    if (match[1] && /^\d/.test(match[1])) {
      // Day Month Year
      const day = parseInt(match[1], 10);
      const month = parseMonth(match[2]);
      const year = parseInt(match[3], 10);
      return new Date(year, month, day);
    } else {
      // Month Day Year
      const month = parseMonth(match[1]);
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
  } else if (formatStr.includes('^(\\d{1,2})')) {
    // Ambiguous format: "12/01/2024" - assume DD/MM/YYYY (European style) if day <= 12, otherwise MM/DD/YYYY
    const val1 = parseInt(match[1], 10);
    const val2 = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    
    let day, month;
    if (val1 <= 12 && val2 <= 12) {
      // Both could be valid day/month, assume DD/MM/YYYY for European format
      day = val1;
      month = val2 - 1;
    } else if (val1 > 12) {
      // First value must be month (MM/DD/YYYY)
      month = val1 - 1;
      day = val2;
    } else {
      // Second value must be month (DD/MM/YYYY)  
      day = val1;
      month = val2 - 1;
    }
    
    return new Date(year, month, day);
  } else if (formatStr.includes('^(\\d{4})')) {
    // ISO-like format: "2024-01-12"
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // JavaScript months are 0-indexed
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  
  throw new Error(`Unknown format pattern: ${formatStr}`);
}

/**
 * Parse month name/abbreviation to month index (0-11)
 * @param {string} monthStr - Month name or abbreviation
 * @returns {number} - Month index (0-11)
 */
function parseMonth(monthStr) {
  const months = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };

  const normalized = monthStr.toLowerCase();
  if (normalized in months) {
    return months[normalized];
  }

  throw new Error(`Unknown month: ${monthStr}`);
}

/**
 * Check if a date is within the specified number of days from now
 * @param {Date} date - Date to check
 * @param {number} days - Number of days to check within
 * @returns {boolean} - True if date is within the specified days
 */
function isWithinDays(date, days) {
  if (!date || isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  const daysAgo = new Date(now);
  daysAgo.setDate(daysAgo.getDate() - days);

  return date >= daysAgo && date <= now;
}

module.exports = {
  parseNexusDate,
  parseRelativeDate,
  parseAbsoluteDate,
  isWithinDays
};