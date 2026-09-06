const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const runtimeMonitor = require('../../utils/runtimeMonitor'); // adjust path if needed

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diagnostics')
    .setDescription('Diagnostics tools')
    .addSubcommand(sub =>
      sub
        .setName('hang-report')
        .setDescription('Generate a hang-state report and write it to disk')
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const report = runtimeMonitor.dumpHangState();

      if (!report) {
        return interaction.editReply({
          content: 'Runtime monitor is not active — no diagnostics available.',
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('Hang Report Generated')
        .setColor(0x00ff99)
        .setDescription('A hang-state report has been written to the `hang_reports/` directory.')
        .addFields(
          {
            name: 'Timestamp',
            value: report.timestamp,
            inline: true,
          },
          {
            name: 'Pending Promises',
            value: `${report.pendingPromises.count}`,
            inline: true,
          },
          {
            name: 'Oldest Promise Age',
            value: `${report.pendingPromises.oldestAgeSeconds}s`,
            inline: true,
          }
        )
        .setFooter({ text: 'Check hang_reports/ for full JSON details.' });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      await interaction.editReply({
        content: `Failed to generate hang report: ${err.message}`,
      });
    }
  },
};
