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
                .setDescription('Keyword to search for')
                .setRequired(true)
        ),
    async execute(interaction) {
        const query = interaction.options.getString('query');
        let connection;
        try {
            connection = await mysql.createConnection(DB_CONFIG);
            // Fetch all matching results, no LIMIT
            const [rows] = await connection.execute(
                "SELECT `mod`, command FROM mod_commands WHERE `mod` LIKE ? OR command LIKE ?",
                [`%${query}%`, `%${query}%`]
            );
            if (rows.length > 0) {
                // Split replies to fit Discord's 2000-character limit
                let replyChunks = [];
                let currentChunk = `Results for **${query}**:\n`;
                for (const row of rows) {
                    let line = `**${row.mod}**:\n\`${row.command}\`\n`;
                    if (currentChunk.length + line.length > 2000) {
                        replyChunks.push(currentChunk);
                        currentChunk = line;
                    } else {
                        currentChunk += line;
                    }
                }
                if (currentChunk.length > 0) replyChunks.push(currentChunk);

                // First reply
                await interaction.reply({
                    content: replyChunks[0],
                    ephemeral: true,
                });
                // Additional replies
                for (let i = 1; i < replyChunks.length; i++) {
                    await interaction.followUp({
                        content: replyChunks[i],
                        ephemeral: true,
                    });
                }
            } else {
                await interaction.reply({
                    content: `No mod commands found for **${query}**. Try checking your spelling or using a different keyword!`,
                    ephemeral: true
                });
            }
        } catch (err) {
            console.error('DB error:', err);
            await interaction.reply({
                content: 'Error querying the database.',
                ephemeral: true
            });
        } finally {
            if (connection) await connection.end();
        }
    }
};
