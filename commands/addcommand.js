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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addcommand')
        .setDescription('Open a popup to manually add mod commands to the database'),
    async execute(interaction) {
        console.log(`[DEBUG] addcommand execute called by user ${interaction.user.tag} (${interaction.user.id})`);
        try {
            // Check mod role or admin
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isModerator = member.roles.cache.has(MODERATOR_ROLE_ID);
            const isAdmin = member.permissions.has("Administrator");
            console.log(`[DEBUG] Member roles:`, member.roles.cache.map(role => role.id));
            console.log(`[DEBUG] isModerator: ${isModerator}, isAdmin: ${isAdmin}`);
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

            const commandsInput = new TextInputBuilder()
                .setCustomId('commands')
                .setLabel('Command codes (one per line, up to 4000 chars)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(4000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(modInput),
                new ActionRowBuilder().addComponents(commandsInput)
            );

            console.log('[DEBUG] Showing modal...');
            await interaction.showModal(modal);
        } catch (err) {
            console.error('[DEBUG] Error in addcommand execute:', err);
            await interaction.reply({ content: "Error showing modal.", ephemeral: true });
        }
    },

    async handleModalSubmit(interaction) {
        console.log(`[DEBUG] Modal submit called by user ${interaction.user.tag} (${interaction.user.id}), customId: ${interaction.customId}`);
        if (interaction.customId !== 'addcommand_modal') return;

        try {
            const mod = interaction.fields.getTextInputValue('mod_name');
            const commandsInput = interaction.fields.getTextInputValue('commands');
            console.log(`[DEBUG] Modal input - mod: ${mod}`);
            console.log(`[DEBUG] Modal input - commandsInput length: ${commandsInput.length}`);

            const commands = commandsInput.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0);
            console.log(`[DEBUG] Parsed ${commands.length} commands`);

            if (commands.length === 0) {
                await interaction.reply({ content: "No valid commands detected.", ephemeral: true });
                return;
            }

            let connection;
            try {
                console.log('[DEBUG] Connecting to MySQL...');
                connection = await mysql.createConnection(DB_CONFIG);
                console.log('[DEBUG] Connected to MySQL');

                for (const command of commands) {
                    console.log(`[DEBUG] Inserting command: ${command}`);
                    await connection.execute("INSERT INTO mod_commands (`mod`, command) VALUES (?, ?)", [mod, command]);
                }
                console.log('[DEBUG] All commands inserted');
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
                    try {
                        await connection.end();
                        console.log('[DEBUG] MySQL connection closed');
                    } catch (closeErr) {
                        console.error('[DEBUG] Error closing MySQL connection:', closeErr);
                    }
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
