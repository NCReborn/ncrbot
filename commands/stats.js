const { SlashCommandBuilder } = require("discord.js");
const snapmaster = require("../../utils/snapmaster");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-stats")
        .setDescription("Shows who is currently eligible for SnapMaster this month"),

    async execute(interaction) {
        const eligible = snapmaster.getEligible(5);

        if (eligible.length === 0) {
            return interaction.reply("No one is eligible yet this month.");
        }

        let msg = "**📸 SnapMaster Eligibility (≥ 5 submissions)**\n\n";

        eligible.forEach(e => {
            msg += `• <@${e.userId}> — ${e.count} submissions\n`;
        });

        interaction.reply(msg);
    }
};
