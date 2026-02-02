const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const buildQueue = require('./queue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View build queue status'),

  async execute(interaction) {
    const status = buildQueue.getStatus();

    const embed = new EmbedBuilder()
      .setTitle('Build Queue')
      .setColor(0x5865F2)
      .setTimestamp();

    if (status.current) {
      const elapsed = Math.round(status.current.elapsed / 1000);
      embed.addFields({
        name: 'Currently Building',
        value:
          `**${status.current.appName}**\n` +
          `Account: ${status.current.account}\n` +
          `Running for: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
        inline: false
      });
    } else {
      embed.addFields({
        name: 'Currently Building',
        value: 'None - ready for new builds',
        inline: false
      });
    }

    if (status.queued.length > 0) {
      const queueList = status.queued
        .map(q => `${q.position}. **${q.appName}** (${q.account})`)
        .join('\n');
      embed.addFields({
        name: `Queued (${status.queued.length})`,
        value: queueList,
        inline: false
      });
    } else {
      embed.addFields({
        name: 'Queued',
        value: 'No builds waiting',
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed] });
  }
};
