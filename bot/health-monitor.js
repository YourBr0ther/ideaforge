const { EmbedBuilder } = require('discord.js');
const { execFileSync } = require('child_process');
const fs = require('fs');

class HealthMonitor {
  constructor() {
    this.client = null;
    this.alertChannelId = process.env.ALERT_CHANNEL_ID;
    this.lastHealthy = Date.now();
    this.alertSent = false;
  }

  setClient(client) {
    this.client = client;
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => this.checkHealth(), 60 * 1000);
  }

  async checkHealth() {
    const issues = [];

    // Check disk space
    try {
      const df = execFileSync('df', ['-h', '/workspace']).toString();
      const usageMatch = df.match(/(\d+)%/);
      if (usageMatch && parseInt(usageMatch[1]) > 90) {
        issues.push(`Disk space critical: ${usageMatch[1]}% used`);
      }
    } catch (e) {
      issues.push('Could not check disk space');
    }

    // Check Claude Code auth
    try {
      const credPaths = [
        '/root/.claude/.credentials.json',
        '/root/.config/claude-code/credentials.json'
      ];
      const hasAuth = credPaths.some(p => fs.existsSync(p));
      if (!hasAuth) {
        issues.push('Claude Code not authenticated');
      }
    } catch (e) {
      issues.push('Could not check auth status');
    }

    // Check memory
    try {
      const free = execFileSync('free', ['-m']).toString();
      const memMatch = free.match(/Mem:\s+(\d+)\s+(\d+)/);
      if (memMatch) {
        const total = parseInt(memMatch[1]);
        const used = parseInt(memMatch[2]);
        const pct = Math.round((used / total) * 100);
        if (pct > 90) {
          issues.push(`Memory critical: ${pct}% used`);
        }
      }
    } catch (e) {
      // Ignore on non-Linux
    }

    if (issues.length > 0 && !this.alertSent) {
      await this.sendAlert(issues);
      this.alertSent = true;
    } else if (issues.length === 0 && this.alertSent) {
      await this.sendRecoveryNotice();
      this.alertSent = false;
      this.lastHealthy = Date.now();
    } else if (issues.length === 0) {
      this.lastHealthy = Date.now();
    }
  }

  async sendAlert(issues) {
    if (!this.client || !this.alertChannelId) return;

    try {
      const channel = await this.client.channels.fetch(this.alertChannelId);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('IdeaForge Health Alert')
            .setDescription(issues.join('\n'))
            .setColor(0xED4245)
            .setTimestamp()
        ]
      });
    } catch (e) {
      console.error('Failed to send health alert:', e);
    }
  }

  async sendRecoveryNotice() {
    if (!this.client || !this.alertChannelId) return;

    try {
      const channel = await this.client.channels.fetch(this.alertChannelId);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('IdeaForge Recovered')
            .setDescription('All systems operational.')
            .setColor(0x57F287)
            .setTimestamp()
        ]
      });
    } catch (e) {
      console.error('Failed to send recovery notice:', e);
    }
  }
}

module.exports = new HealthMonitor();
