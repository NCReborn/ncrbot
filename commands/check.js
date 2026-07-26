const { SlashCommandBuilder } = require("discord.js");
const snapmaster = require('../utils/snapmaster');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-check")
        .setDescription("Shows all submissions made by a user this month")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("User to check")
                .setRequired(true)
        ),

    async execute(interaction) {
        const user = interaction.options.getUser("user");
        const data = snapmaster.getUser(user.id);

        if (!data || data.messages.length === 0) {
            return interaction.reply(`No SnapMaster submissions found for ${user}.`);
        }

        let msg = `📸 **SnapMaster submissions for ${user}:**\n\n`;

        data.messages.forEach(link => {
            msg += `${link}\n`;
        });

        interaction.reply(msg);
    }
};
