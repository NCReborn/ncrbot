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
        .setDescription('Add a new mod command if not already present')
        .addStringOption(option =>
            option.setName('mod_name')
                .setDescription('The mod name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('command_code')
                .setDescription('The command code')
                .setRequired(true)),
    async execute(interaction) {
        const modName = interaction.options.getString('mod_name');
        const commandCode = interaction.options.getString('command_code');

        let connection;
        try {
            connection = await mysql.createConnection(DB_CONFIG);

            // Check for duplicate
            const [rows] = await connection.execute(
                "SELECT * FROM mod_commands WHERE `mod` = ? AND command = ?",
                [modName, commandCode]
            );

            if (rows.length > 0) {
                await interaction.reply({
                    content: `❌ The command \`${commandCode}\` for mod \`${modName}\` is already stored.`,
                    ephemeral: true
                });
                return;
            }

            // Insert new command
            await connection.execute(
                "INSERT INTO mod_commands (`mod`, command) VALUES (?, ?)",
                [modName, commandCode]
            );

            await interaction.reply({
                content: `✅ Added command \`${commandCode}\` for mod \`${modName}\`.`,
                ephemeral: true
            });
        } catch (err) {
            await interaction.reply({
                content: `Error processing command: ${err.message}`,
                ephemeral: true
            });
        } finally {
            if (connection) {
                try { await connection.end(); } catch {}
            }
        }
    }
};
