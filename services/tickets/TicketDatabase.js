const logger = require('../../utils/logger');
const { getPool } = require('../../utils/database');

class TicketDatabase {
  async initialize() {
    const pool = await getPool();
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id VARCHAR(36) NOT NULL PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20) NOT NULL,
        opened_by VARCHAR(20) NOT NULL,
        opened_by_name VARCHAR(100),
        report_type ENUM('suspicious_dm', 'harassment', 'other') NOT NULL,
        details LONGTEXT NOT NULL,
        status ENUM('open', 'closed') DEFAULT 'open',
        closed_by VARCHAR(20) NULL,
        closed_at DATETIME NULL,
        reopened_by VARCHAR(20) NULL,
        reopened_at DATETIME NULL,
        transcript LONGTEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_guild (guild_id),
        INDEX idx_channel (channel_id),
        INDEX idx_opened_by (opened_by),
        INDEX idx_status (status)
      )
    `);
    logger.info('[TICKETS] Database schema verified');
  }

  async createTicket(ticketData) {
    const pool = await getPool();
    const {
      ticket_id,
      guild_id,
      channel_id,
      opened_by,
      opened_by_name,
      report_type,
      details,
    } = ticketData;

    try {
      await pool.execute(
        `INSERT INTO tickets (ticket_id, guild_id, channel_id, opened_by, opened_by_name, report_type, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ticket_id, guild_id, channel_id, opened_by, opened_by_name, report_type, details]
      );
      logger.info(`[TICKETS] Created ticket ${ticket_id}`);
      return true;
    } catch (err) {
      logger.error(`[TICKETS] Failed to create ticket: ${err.message}`);
      throw err;
    }
  }

  async getTicket(ticket_id) {
    const pool = await getPool();
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM tickets WHERE ticket_id = ?',
        [ticket_id]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      logger.error(`[TICKETS] Failed to fetch ticket: ${err.message}`);
      throw err;
    }
  }

  async getTicketByChannel(channel_id) {
    const pool = await getPool();
    try {
      const [rows] = await pool.execute(
        'SELECT ticket_id FROM tickets WHERE channel_id = ?',
        [channel_id]
      );
      return rows.length > 0 ? rows[0].ticket_id : null;
    } catch (err) {
      logger.error(`[TICKETS] Failed to fetch ticket by channel: ${err.message}`);
      throw err;
    }
  }

  async updateTicket(ticket_id, updates) {
    const pool = await getPool();
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    values.push(ticket_id);

    const setClause = keys.map(k => `${k} = ?`).join(', ');

    try {
      await pool.execute(
        `UPDATE tickets SET ${setClause} WHERE ticket_id = ?`,
        values
      );
      logger.info(`[TICKETS] Updated ticket ${ticket_id}`);
      return true;
    } catch (err) {
      logger.error(`[TICKETS] Failed to update ticket: ${err.message}`);
      throw err;
    }
  }

  async getTicketsByUser(user_id) {
    const pool = await getPool();
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM tickets WHERE opened_by = ? ORDER BY created_at DESC',
        [user_id]
      );
      return rows;
    } catch (err) {
      logger.error(`[TICKETS] Failed to fetch user tickets: ${err.message}`);
      throw err;
    }
  }

  async getOpenTickets(guild_id) {
    const pool = await getPool();
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM tickets WHERE guild_id = ? AND status = "open" ORDER BY created_at DESC',
        [guild_id]
      );
      return rows;
    } catch (err) {
      logger.error(`[TICKETS] Failed to fetch open tickets: ${err.message}`);
      throw err;
    }
  }
}

module.exports = TicketDatabase;
