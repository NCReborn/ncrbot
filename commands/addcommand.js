const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

const MODERATOR_ROLE_ID = "1370874936456908931";
const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT)
};

// Number of input fields for commands
const COMMAND_FIELDS = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addcommand')
        .setDescription('Open a popup to manually add mod commands to the database'),
    async execute(interaction) {
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isModerator = member.roles.cache.has(MODERATOR_ROLE_ID);
            const isAdmin = member.permissions.has("Administrator");
            if (!isModerator && !isAdmin) {
                await interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
                return;
            }

            // Build modal
            const modal = new ModalBuilder()
                .setCustomId('addcommand_modal')
                .setTitle('Add Mod Commands');

            const modInput = new TextInputBuilder()
                .setCustomId('mod_name')
                .setLabel('Mod name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // Add multiple command input fields
            let actionRows = [new ActionRowBuilder().addComponents(modInput)];
            for (let i = 1; i <= COMMAND_FIELDS; i++) {
                const commandsInput = new TextInputBuilder()
                    .setCustomId(`commands_${i}`)
                    .setLabel(`Command codes ${i} (one per line)`)
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(i === 1) // Only require the first box
                    .setMaxLength(4000)
                    .setPlaceholder(`Paste codes here (max 4000 chars)`);
                actionRows.push(new ActionRowBuilder().addComponents(commandsInput));
            }

            modal.addComponents(...actionRows);

            await interaction.showModal(modal);
        } catch (err) {
            console.error('[DEBUG] Error in addcommand execute:', err);
            await interaction.reply({ content: "Error showing modal.", ephemeral: true });
        }
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'addcommand_modal') return;

        try {
            const mod = interaction.fields.getTextInputValue('mod_name');
            let commands = [];
            for (let i = 1; i <= COMMAND_FIELDS; i++) {
                const value = interaction.fields.getTextInputValue(`commands_${i}`);
                if (value && value.trim().length > 0) {
                    commands = commands.concat(value.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0));
                }
            }

            if (commands.length === 0) {
                await interaction.reply({ content: "No valid commands detected.", ephemeral: true });
                return;
            }

            let connection;
            try {
                connection = await mysql.createConnection(DB_CONFIG);

                for (const command of commands) {
                    await connection.execute("INSERT INTO mod_commands (`mod`, command) VALUES (?, ?)", [mod, command]);
                }
                await interaction.reply({
                    content: `Added ${commands.length} command(s) to **${mod}**.`,
                    ephemeral: true
                });

            } catch (dbErr) {
                console.error('[DEBUG] DB error:', dbErr);
                await interaction.reply({
                    content: `Error adding commands to the database.\n${dbErr.message}`,
                    ephemeral: true
                });
            } finally {
                if (connection) {
                    try { await connection.end(); } catch {}
                }
            }
        } catch (outerErr) {
            console.error('[DEBUG] Error handling modal submit:', outerErr);
            await interaction.reply({
                content: `Error processing modal submission.\n${outerErr.message}`,
                ephemeral: true
            });
        }
    }
};
