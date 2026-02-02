const { Client, GatewayIntentBits, Events, REST, Routes } = require('discord.js');
const forgeCommand = require('./forge-command');
const authCommand = require('./auth-command');
const cancelCommand = require('./cancel-command');
const queueCommand = require('./queue-command');
const healthCommand = require('./health-command');
const buildQueue = require('./queue');
const healthMonitor = require('./health-monitor');
const credentialBackup = require('./credential-backup');
const express = require('express');

// Restore credentials from backup if missing on startup
credentialBackup.restore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      {
        body: [
          forgeCommand.data.toJSON(),
          authCommand.data.toJSON(),
          cancelCommand.data.toJSON(),
          queueCommand.data.toJSON(),
          healthCommand.data.toJSON()
        ]
      }
    );
    console.log('Slash commands registered: /forge, /auth, /cancel, /queue, /health');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
}

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'forge':
          await forgeCommand.execute(interaction);
          break;
        case 'auth':
          await authCommand.execute(interaction);
          break;
        case 'cancel':
          await cancelCommand.execute(interaction);
          break;
        case 'queue':
          await queueCommand.execute(interaction);
          break;
        case 'health':
          await healthCommand.execute(interaction);
          break;
      }
    }
    // Button clicks
    else if (interaction.isButton()) {
      if (interaction.customId.startsWith('forge_account_')) {
        await forgeCommand.handleButton(interaction);
      } else if (interaction.customId === 'auth_enter_code') {
        await authCommand.handleCodeButton(interaction);
      } else if (interaction.customId.startsWith('forge_retry_')) {
        await forgeCommand.handleRetryButton(interaction);
      } else if (interaction.customId === 'forge_view_logs') {
        await forgeCommand.handleViewLogsButton(interaction);
      }
    }
    // Modal submits
    else if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('forge_modal_')) {
        await forgeCommand.handleModal(interaction);
      } else if (interaction.customId === 'auth_code_modal') {
        await authCommand.handleCodeModal(interaction);
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);

    const errorMessage = {
      content: `Error: ${error.message}`,
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage).catch(() => {});
    } else {
      await interaction.reply(errorMessage).catch(() => {});
    }
  }
});

client.once(Events.ClientReady, (c) => {
  console.log(`IdeaForge bot ready as ${c.user.tag}`);
  console.log('Commands: /forge, /auth, /cancel, /queue, /health');
  console.log('GitHub accounts: YourBr0ther, ProtoForgeAI, DrFlirtashi');

  buildQueue.setClient(c);
  healthMonitor.setClient(c);
});

// Health check endpoint for K8s probes
const app = express();
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/queue', (req, res) => res.json(buildQueue.getStatus()));
app.listen(3000);

// Start
registerCommands();
client.login(process.env.DISCORD_BOT_TOKEN);
