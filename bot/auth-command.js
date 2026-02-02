const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');
const { execFileSync } = require('child_process');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auth')
    .setDescription('Check Claude Code authentication status'),

  async execute(interaction) {
    await interaction.deferReply();

    // Check if Claude Code credentials exist
    const credPaths = [
      '/root/.claude/.credentials.json',
      '/root/.config/claude-code/credentials.json'
    ];
    const validPath = credPaths.find(p => fs.existsSync(p));

    if (validPath) {
      const stats = fs.statSync(validPath);
      const age = Math.round((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24));

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Claude Code Authenticated')
            .setDescription(
              `Credentials found (${age} days old).\n\n` +
              'You can use `/forge` to build apps.'
            )
            .setColor(0x57F287)
        ]
      });
    } else {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Claude Code Not Authenticated')
            .setDescription(
              'Claude Code needs to be authenticated interactively.\n\n' +
              '**Run this from your terminal:**\n' +
              '```bash\n' +
              'kubectl exec -it deployment/ideaforge-runner -n ideaforge -- claude\n' +
              '```\n' +
              'Follow the prompts to log in, then exit. ' +
              'Credentials will persist on the Longhorn PVC.'
            )
            .setColor(0xFFA500)
        ]
      });
    }
  }
};
