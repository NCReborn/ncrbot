const { SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

const MODERATOR_ROLE_ID = "1370874936456908931"; // Your moderator role ID

const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT)
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addcommand')
        .setDescription('Manually add mod commands to the database')
        .addStringOption(option =>
            option.setName('mod')
                .setDescription('Name of the mod')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('commands')
                .setDescription('One or more mod command codes, one per line')
                .setRequired(true)
        ),
    async execute(interaction) {
        // Check for mod role or admin
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isModerator = member.roles.cache.has(MODERATOR_ROLE_ID);
        const isAdmin = member.permissions.has("Administrator");

        if (!isModerator && !isAdmin) {
            await interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
            return;
        }

        const mod = interaction.options.getString('mod');
        const commandsInput = interaction.options.getString('commands');

        // Split commands by newlines and filter out empty lines
        const commands = commandsInput.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0);

        if (commands.length === 0) {
            await interaction.reply({ content: "No valid commands detected.", ephemeral: true });
            return;
        }

        let connection;
        try {
            connection = await mysql.createConnection(DB_CONFIG);

            // Insert each command into the database
            for (const command of commands) {
                await connection.execute(
                    "INSERT INTO mod_commands (`mod`, command) VALUES (?, ?)",
                    [mod, command]
                );
            }

            await interaction.reply({
                content: `Added ${commands.length} command(s) to **${mod}**.`,
                ephemeral: true
            });

        } catch (err) {
            console.error('DB error:', err);
            await interaction.reply({
                content: 'Error adding commands to the database.',
                ephemeral: true
            });
        } finally {
            if (connection) await connection.end();
        }
    }
};
