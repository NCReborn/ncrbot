const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

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
                "SELECT `mod`, command FROM mod_commands WHERE `mod` LIKE ? OR command LIKE ?",
                [`%${query}%`, `%${query}%`]
            );
            if (rows.length > 0) {
                let replyChunks = [];
                let currentChunk = `Results for **${query}**:\n`;
                let txtOutput = `Results for ${query}:\n\n`;
                for (const row of rows) {
                    let line = `**${row.mod}**:\n\`${row.command}\`\n`;
                    let txtLine = `${row.mod}:\n${row.command}\n\n`;
                    txtOutput += txtLine;
                    if (currentChunk.length + line.length > 2000) {
                        replyChunks.push(currentChunk);
                        currentChunk = line;
                    } else {
                        currentChunk += line;
                    }
                }
                if (currentChunk.length > 0) replyChunks.push(currentChunk);

                // If more than 3 chunks, send as file
                if (replyChunks.length > 3) {
                    // Write to a .txt file
                    const filename = `mod_commands_${query.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.txt`;
                    const filepath = path.join(__dirname, filename);
                    fs.writeFileSync(filepath, txtOutput, "utf8");
                    const file = new AttachmentBuilder(filepath, { name: filename });
                    await interaction.reply({
                        content: `Too many results for **${query}**. See attached file for full list.`,
                        files: [file],
                        ephemeral: true
                    });
                    // Optionally delete the temp file after sending
                    setTimeout(() => {
                        fs.unlink(filepath, () => {});
                    }, 30000); // 30s later
                } else {
                    // Otherwise send as ephemeral messages
                    await interaction.reply({
                        content: replyChunks[0],
                        ephemeral: true,
                    });
                    for (let i = 1; i < replyChunks.length; i++) {
                        await interaction.followUp({
                            content: replyChunks[i],
                            ephemeral: true,
                        });
                    }
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
