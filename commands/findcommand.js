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
            const [rows] = await connection.execute(
                "SELECT `mod`, command FROM mod_commands WHERE `mod` LIKE ? OR command LIKE ? LIMIT 10",
                [`%${query}%`, `%${query}%`]
            );
            if (rows.length > 0) {
                let reply = rows.map(row => `**${row.mod}**:\n\`${row.command}\``).join('\n');
                if (reply.length > 2000) reply = reply.slice(0, 1990) + '\n...';
                await interaction.reply({ content: `Results for **${query}**:\n${reply}` });
            } else {
                await interaction.reply({
                    content: `No mod commands found for **${query}**. Try checking your spelling or using a different keyword!`
                });
            }
        } catch (err) {
            console.error('DB error:', err);
            await interaction.reply({ content: 'Error querying the database.' });
        } finally {
            if (connection) await connection.end();
        }
    }
};
