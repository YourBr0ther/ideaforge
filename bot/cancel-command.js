const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const buildQueue = require('./queue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel the current running build'),

  async execute(interaction) {
    const cancelled = buildQueue.cancel();

    if (cancelled) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Build Cancelled')
            .setDescription(`**${cancelled.config.appName}** has been cancelled.`)
            .addFields(
              { name: 'Account', value: cancelled.config.account.name, inline: true },
              {
                name: 'Runtime',
                value: `${Math.round((Date.now() - cancelled.startedAt) / 1000)}s`,
                inline: true
              }
            )
            .setColor(0xED4245)
        ]
      });
    } else {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('No Active Build')
            .setDescription('There is no build currently running.')
            .setColor(0x5865F2)
        ],
        ephemeral: true
      });
    }
  }
};
