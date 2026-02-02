const { EmbedBuilder } = require('discord.js');

class BuildQueue {
  constructor() {
    this.queue = [];
    this.currentBuild = null;
    this.lastCompletedBuild = null;
    this.client = null;
  }

  setClient(client) {
    this.client = client;
  }

  async add(buildConfig) {
    const queueEntry = {
      id: Date.now().toString(),
      config: buildConfig,
      status: 'queued',
      addedAt: new Date(),
      interaction: buildConfig.interaction
    };

    this.queue.push(queueEntry);

    if (this.currentBuild) {
      const position = this.queue.length;
      await buildConfig.interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setTitle('Added to Queue')
            .setDescription(
              `**${buildConfig.appName}** is #${position} in queue.\n\n` +
              `Current build: **${this.currentBuild.config.appName}**`
            )
            .setColor(0x5865F2)
        ]
      });
    }

    this.processNext();
    return queueEntry.id;
  }

  async processNext() {
    if (this.currentBuild || this.queue.length === 0) return;

    this.currentBuild = this.queue.shift();
    this.currentBuild.status = 'running';
    this.currentBuild.startedAt = new Date();

    try {
      await this.currentBuild.config.executeBuild();
    } catch (error) {
      console.error('Build failed:', error);
    } finally {
      this.currentBuild = null;
      this.processNext();
    }
  }

  cancel() {
    if (!this.currentBuild) return null;

    const cancelled = this.currentBuild;
    if (cancelled.process) {
      cancelled.process.kill('SIGTERM');
    }
    cancelled.status = 'cancelled';
    this.currentBuild = null;

    setTimeout(() => this.processNext(), 1000);

    return cancelled;
  }

  getStatus() {
    return {
      current: this.currentBuild ? {
        appName: this.currentBuild.config.appName,
        account: this.currentBuild.config.account.name,
        startedAt: this.currentBuild.startedAt,
        elapsed: Date.now() - this.currentBuild.startedAt.getTime()
      } : null,
      queued: this.queue.map((entry, i) => ({
        position: i + 1,
        appName: entry.config.appName,
        account: entry.config.account.name,
        waitingFor: Date.now() - entry.addedAt.getTime()
      }))
    };
  }

  setCurrentProcess(proc) {
    if (this.currentBuild) {
      this.currentBuild.process = proc;
    }
  }

  getLastBuild() {
    return this.lastCompletedBuild;
  }

  setLastBuild(config, result) {
    this.lastCompletedBuild = { config, result, completedAt: new Date() };
  }
}

module.exports = new BuildQueue();
