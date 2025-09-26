const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
        .setName('removecommand')
        .setDescription('Remove a command for a mod (including duplicates)')
        .addStringOption(option =>
            option.setName('mod_name')
                .setDescription('The mod name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('command_code')
                .setDescription('The command code to remove')
                .setRequired(true)),
    async execute(interaction) {
        // --- ADMIN CHECK ---
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                content: 'You do not have permission to use this command. (Admin only)',
                ephemeral: true
            });
            return;
        }

        const modName = interaction.options.getString('mod_name');
        const commandCode = interaction.options.getString('command_code');

        let connection;
        try {
            connection = await mysql.createConnection(DB_CONFIG);

            // Check if it exists
            const [rows] = await connection.execute(
                "SELECT * FROM mod_commands WHERE `mod` = ? AND command = ?",
                [modName, commandCode]
            );

            if (!rows.length) {
                await interaction.reply({
                    content: `❌ No command \`${commandCode}\` found for mod \`${modName}\`.`,
                    ephemeral: true
                });
                return;
            }

            // Remove all matching entries (including duplicates)
            await connection.execute(
                "DELETE FROM mod_commands WHERE `mod` = ? AND command = ?",
                [modName, commandCode]
            );

            await interaction.reply({
                content: `✅ Removed ${rows.length} command(s) \`${commandCode}\` for mod \`${modName}\`.`,
                ephemeral: true
            });
        } catch (err) {
            await interaction.reply({
                content: `Error removing command: ${err.message}`,
                ephemeral: true
            });
        } finally {
            if (connection) {
                try { await connection.end(); } catch {}
            }
        }
    }
};
