const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const buildQueue = require('./queue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Check IdeaForge system status'),

  async execute(interaction) {
    await interaction.deferReply();

    const checks = [];

    // Pod status
    checks.push({ name: 'Bot', status: 'Online', ok: true });

    // Auth status
    try {
      const credPaths = [
        '/root/.claude/.credentials.json',
        '/root/.config/claude-code/credentials.json'
      ];
      const validPath = credPaths.find(p => fs.existsSync(p));
      if (validPath) {
        const stats = fs.statSync(validPath);
        const age = Math.round((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24));
        checks.push({
          name: 'Claude Auth',
          status: `Valid (${age}d old)`,
          ok: true
        });
      } else {
        checks.push({ name: 'Claude Auth', status: 'Not authenticated', ok: false });
      }
    } catch (e) {
      checks.push({ name: 'Claude Auth', status: 'Unknown', ok: false });
    }

    // Disk space
    try {
      const df = execFileSync('df', ['-h', '/workspace']).toString();
      const match = df.match(/(\d+)%/);
      const usage = match ? parseInt(match[1]) : 0;
      const ok = usage < 90;
      checks.push({
        name: 'Disk',
        status: `${usage}% used`,
        ok
      });
    } catch (e) {
      checks.push({ name: 'Disk', status: 'Unknown', ok: false });
    }

    // Memory
    try {
      const free = execFileSync('free', ['-m']).toString();
      const match = free.match(/Mem:\s+(\d+)\s+(\d+)/);
      if (match) {
        const pct = Math.round((parseInt(match[2]) / parseInt(match[1])) * 100);
        const ok = pct < 90;
        checks.push({
          name: 'Memory',
          status: `${pct}% used`,
          ok
        });
      }
    } catch (e) {
      checks.push({ name: 'Memory', status: 'N/A (non-Linux)', ok: true });
    }

    // Queue status
    const queueStatus = buildQueue.getStatus();
    checks.push({
      name: 'Queue',
      status: queueStatus.current
        ? `Building (${queueStatus.queued.length} waiting)`
        : `Idle (${queueStatus.queued.length} queued)`,
      ok: true
    });

    const allOk = checks.every(c => c.ok);

    const embed = new EmbedBuilder()
      .setTitle(allOk ? 'System Healthy' : 'Issues Detected')
      .setColor(allOk ? 0x57F287 : 0xFFA500)
      .setTimestamp();

    for (const check of checks) {
      embed.addFields({
        name: check.name,
        value: `${check.ok ? 'OK' : 'WARN'}: ${check.status}`,
        inline: true
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};
