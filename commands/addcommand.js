const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

const MODERATOR_ROLE_ID = "1370874936456908931"; // Change as needed
const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT)
};

const COMMAND_FIELDS = 4; // Number of command fields (plus mod name)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addcommand')
        .setDescription('Open a popup to manually add mod commands to the database'),
    async execute(interaction) {
        try {
            // Check mod role or admin
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

            // Add up to 4 command input fields (total 5 allowed by Discord modals)
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

            await interaction.deferReply({ ephemeral: true });

            if (commands.length === 0) {
                await interaction.editReply({ content: "No valid commands detected." });
                return;
            }

            let connection;
            let added = 0;
            let duplicates = [];
            try {
                connection = await mysql.createConnection(DB_CONFIG);

                for (const command of commands) {
                    // Check for global duplicate (regardless of mod)
                    const [rows] = await connection.execute(
                        "SELECT * FROM mod_commands WHERE command = ?",
                        [command]
                    );
                    if (rows.length > 0) {
                        // Optionally include which mod(s) already have this command
                        const existingMods = [...new Set(rows.map(r => r.mod))].join(", ");
                        duplicates.push(`${command} (already in: ${existingMods})`);
                        continue;
                    }
                    await connection.execute(
                        "INSERT INTO mod_commands (`mod`, command) VALUES (?, ?)",
                        [mod, command]
                    );
                    added++;
                }

                let replyMsg = `Added ${added} command(s) to **${mod}**.`;
                if (duplicates.length > 0) {
                    replyMsg += `\n❌ Skipped ${duplicates.length} duplicate command(s):\n` +
                        duplicates.map(d => `• \`${d}\``).join('\n');
                }

                await interaction.editReply({ content: replyMsg });

            } catch (dbErr) {
                await interaction.editReply({
                    content: `Error adding commands to the database.\n${dbErr.message}`
                });
            } finally {
                if (connection) {
                    try { await connection.end(); } catch (closeErr) {}
                }
            }
        } catch (outerErr) {
            await interaction.editReply({
                content: `Error processing modal submission.\n${outerErr.message}`
            });
        }
    }
};
