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
        .setName('addcommandmodal')
        .setDescription('Open a popup to manually add mod commands to the database'),
    async execute(interaction) {
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

        await interaction.showModal(modal);
    },
    // This handler goes in your interactionCreate.js or similar central event file:
    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'addcommand_modal') return;

        const mod = interaction.fields.getTextInputValue('mod_name');
        const commandsInput = interaction.fields.getTextInputValue('commands');
        const commands = commandsInput.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0);

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
            await connection.reply({
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
