const { SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT)
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('findcommand')
        .setDescription('Search for mod commands by keyword (mod name, item, etc.)')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Search term (mod name, command, etc.)')
                .setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString('query');

        let connection;
        try {
            connection = await mysql.createConnection(DB_CONFIG);

            // Perform search by mod name or command code
            const [rows] = await connection.execute(
                "SELECT * FROM mod_commands WHERE `mod` LIKE ? OR command LIKE ?",
                [`%${query}%`, `%${query}%`]
            );

            if (!rows.length) {
                await interaction.reply({
                    content: `No commands found matching \`${query}\`.`,
                    ephemeral: true
                });
                return;
            }

            // Format results
            const results = rows.map(row => `• \`${row.mod}\` — \`${row.command}\``).join('\n');
            await interaction.reply({
                content: `Found these commands:\n${results}`,
                ephemeral: true
            });
        } catch (err) {
            await interaction.reply({
                content: `Error searching commands: ${err.message}`,
                ephemeral: true
            });
        } finally {
            if (connection) {
                try { await connection.end(); } catch {}
            }
        }
    }
};
