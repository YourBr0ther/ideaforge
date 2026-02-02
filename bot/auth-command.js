const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');

// Store pending auth processes
const pendingAuth = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auth')
    .setDescription('Authenticate Claude Code with your subscription'),

  pendingAuth,

  async execute(interaction) {
    await interaction.deferReply();

    const proc = spawn('claude', ['login'], {
      env: { ...process.env, HOME: '/root' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let authUrl = null;
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();

      const urlMatch = output.match(/(https:\/\/[^\s]+anthropic[^\s]+)/);
      if (urlMatch && !authUrl) {
        authUrl = urlMatch[1];

        pendingAuth.set(interaction.user.id, {
          process: proc,
          timestamp: Date.now()
        });

        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Claude Code Authentication')
              .setDescription(
                `**Step 1:** Click the link below to authenticate:\n` +
                `${authUrl}\n\n` +
                `**Step 2:** After authenticating, you'll receive a code.\n\n` +
                `**Step 3:** Click the button below and paste your code.`
              )
              .setColor(0x5865F2)
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('auth_enter_code')
                .setLabel('Enter Auth Code')
                .setStyle(ButtonStyle.Primary)
            )
          ]
        });
      }
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      const pending = pendingAuth.get(interaction.user.id);
      if (pending && pending.completed) {
        return;
      }

      pendingAuth.delete(interaction.user.id);

      if (code !== 0 && !authUrl) {
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Auth Failed')
              .setDescription(`Claude login failed:\n\`\`\`${output.slice(-500)}\`\`\``)
              .setColor(0xED4245)
          ],
          components: []
        }).catch(() => {});
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingAuth.has(interaction.user.id)) {
        proc.kill();
        pendingAuth.delete(interaction.user.id);
        interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Auth Timed Out')
              .setDescription('Authentication timed out after 5 minutes. Run `/auth` again.')
              .setColor(0xFFA500)
          ],
          components: []
        }).catch(() => {});
      }
    }, 5 * 60 * 1000);
  },

  async handleCodeButton(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('auth_code_modal')
      .setTitle('Enter Auth Code');

    const codeInput = new TextInputBuilder()
      .setCustomId('auth_code')
      .setLabel('Paste the code from the browser')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('abc123xyz...')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
    await interaction.showModal(modal);
  },

  async handleCodeModal(interaction) {
    const code = interaction.fields.getTextInputValue('auth_code').trim();
    const pending = pendingAuth.get(interaction.user.id);

    if (!pending) {
      await interaction.reply({
        content: 'No pending authentication. Run `/auth` first.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    // Pipe the code to the waiting process
    pending.process.stdin.write(code + '\n');
    pending.completed = true;

    // Wait for auth to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if auth succeeded
    try {
      execFileSync('claude', ['--version'], {
        env: { ...process.env, HOME: '/root' },
        timeout: 10000
      });

      await this.persistCredentials();
      pendingAuth.delete(interaction.user.id);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Authentication Successful!')
            .setDescription(
              'Claude Code is now authenticated with your subscription.\n\n' +
              'You can now use `/forge` to build apps!'
            )
            .setColor(0x57F287)
        ]
      });
    } catch (error) {
      pendingAuth.delete(interaction.user.id);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Authentication Failed')
            .setDescription(
              `Something went wrong:\n\`\`\`${error.message}\`\`\`\n\n` +
              'Try running `/auth` again.'
            )
            .setColor(0xED4245)
        ]
      });
    }
  },

  async persistCredentials() {
    const credDir = '/root/.claude';
    const persistDir = '/config/claude-auth';

    if (!fs.existsSync(persistDir)) {
      fs.mkdirSync(persistDir, { recursive: true });
    }

    const files = ['.credentials.json', 'settings.local.json'];
    for (const file of files) {
      const src = `${credDir}/${file}`;
      const dst = `${persistDir}/${file}`;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }
  }
};
