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
const path = require('path');
const buildQueue = require('./queue');

// Non-root user for running Claude Code (refuses --dangerously-skip-permissions as root)
const FORGE_UID = 1001;
const FORGE_GID = 1001;
const FORGE_HOME = '/home/forge';

function syncCredentialsToForgeUser() {
  const srcDir = '/root/.claude';
  const dstDir = path.join(FORGE_HOME, '.claude');

  fs.mkdirSync(dstDir, { recursive: true });

  const files = ['.credentials.json', 'settings.json', 'settings.local.json'];
  for (const file of files) {
    const src = path.join(srcDir, file);
    const dst = path.join(dstDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      fs.chownSync(dst, FORGE_UID, FORGE_GID);
    }
  }
  fs.chownSync(dstDir, FORGE_UID, FORGE_GID);
}

// GitHub account configuration
const GITHUB_ACCOUNTS = {
  personal: {
    name: 'YourBr0ther',
    label: 'Personal',
    token: process.env.GITHUB_TOKEN_PERSONAL,
    color: 0x6E7681
  },
  corporate: {
    name: 'ProtoForgeAI',
    label: 'Corporate',
    token: process.env.GITHUB_TOKEN_CORPORATE,
    color: 0x238636
  },
  spicy: {
    name: 'DrFlirtashi',
    label: 'Spicy',
    token: process.env.GITHUB_TOKEN_SPICY,
    color: 0xDA3633
  }
};

const PROGRESS_PATTERNS = [
  { pattern: /creating|initializing|mkdir/i, status: 'Creating project structure...', progress: 10 },
  { pattern: /npm install|installing|dependencies/i, status: 'Installing dependencies...', progress: 25 },
  { pattern: /writing|creating.*component|creating.*file/i, status: 'Writing components...', progress: 40 },
  { pattern: /styling|tailwind|css/i, status: 'Applying styles...', progress: 55 },
  { pattern: /building|vite|webpack|compile/i, status: 'Building application...', progress: 70 },
  { pattern: /git init|git add|committing/i, status: 'Committing to git...', progress: 80 },
  { pattern: /pushing|git push|gh repo/i, status: 'Pushing to GitHub...', progress: 90 },
  { pattern: /pages|deploying|deployment/i, status: 'Deploying to GitHub Pages...', progress: 95 },
];

function createProgressBar(percent) {
  const filled = Math.round(percent / 5);
  const empty = 20 - filled;
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forge')
    .setDescription('Spawn a new app idea with Claude Code'),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('forge_account_personal')
        .setLabel('Personal')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('forge_account_corporate')
        .setLabel('Corporate')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('forge_account_spicy')
        .setLabel('Spicy')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      content: '**Select GitHub account for deployment:**',
      components: [row],
      ephemeral: true
    });
  },

  async handleButton(interaction) {
    const accountKey = interaction.customId.replace('forge_account_', '');
    const account = GITHUB_ACCOUNTS[accountKey];

    const modal = new ModalBuilder()
      .setCustomId(`forge_modal_${accountKey}`)
      .setTitle(`Forge App -> ${account.name}`);

    const nameInput = new TextInputBuilder()
      .setCustomId('app_name')
      .setLabel('App Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('BudgetBuddy')
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Track daily expenses with receipt scanning...')
      .setRequired(true);

    const stackInput = new TextInputBuilder()
      .setCustomId('tech_stack')
      .setLabel('Tech Stack')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('React, Tailwind, Vite')
      .setRequired(false);

    const designInput = new TextInputBuilder()
      .setCustomId('design')
      .setLabel('Design Style')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('minimal, dark mode, glassmorphism')
      .setRequired(false);

    const featuresInput = new TextInputBuilder()
      .setCustomId('features')
      .setLabel('MVP Features (one per line)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Add expense\nView monthly summary\nExport CSV')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(stackInput),
      new ActionRowBuilder().addComponents(designInput),
      new ActionRowBuilder().addComponents(featuresInput)
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const accountKey = interaction.customId.replace('forge_modal_', '');
    const account = GITHUB_ACCOUNTS[accountKey];

    const appName = interaction.fields.getTextInputValue('app_name');
    const description = interaction.fields.getTextInputValue('description');
    const techStack = interaction.fields.getTextInputValue('tech_stack') || 'React, Tailwind, Vite';
    const design = interaction.fields.getTextInputValue('design') || 'minimal, clean, modern';
    const features = interaction.fields.getTextInputValue('features') || '';

    const slug = appName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Forging Started')
          .setDescription(`Building **${appName}**...`)
          .addFields(
            { name: 'Account', value: `${account.label} (${account.name})`, inline: true },
            { name: 'Stack', value: techStack, inline: true },
            { name: 'Design', value: design, inline: true }
          )
          .setColor(account.color)
          .setTimestamp()
      ]
    });

    const buildConfig = {
      appName,
      slug,
      description,
      techStack: techStack.split(',').map(s => s.trim()),
      design,
      features: features.split('\n').filter(f => f.trim()),
      account,
      accountKey,
      interaction,
      executeBuild: () => this.runForge({
        appName,
        slug,
        description,
        techStack: techStack.split(',').map(s => s.trim()),
        design,
        features: features.split('\n').filter(f => f.trim()),
        account,
        accountKey,
        interaction
      })
    };

    await buildQueue.add(buildConfig);
  },

  async runForge({ appName, slug, description, techStack, design, features, account, accountKey, interaction }) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = '/logs';
    const logFile = `${logDir}/${timestamp}-${slug}.log`;
    const projectDir = `/workspace/${accountKey}/${slug}`;

    // Ensure directories exist and sync credentials to non-root user
    fs.mkdirSync(`/workspace/${accountKey}`, { recursive: true });
    fs.chownSync(`/workspace/${accountKey}`, FORGE_UID, FORGE_GID);
    fs.mkdirSync(logDir, { recursive: true });
    syncCredentialsToForgeUser();

    const prompt = `
# Project: ${appName}

## Deployment Target
- GitHub Account: ${account.name}
- Repository will be created at: github.com/${account.name}/${slug}

## Constraints
- Building a modern web application
- Tech Stack: ${techStack.join(', ')}
- Design: ${design}
- MUST deploy to GitHub Pages when complete
- MUST be functional on first deploy
- Use your installed MCP plugins: context7, superpowers, github, ralph-loop
- Answer your own questions - do not ask for clarification

## Description
${description}

## MVP Features
${features.map((f, i) => `${i + 1}. ${f}`).join('\n') || '- Core functionality as described above'}

## Instructions
1. Create project directory: ${projectDir}
2. Initialize with ${techStack[0] || 'Vite'} and appropriate tooling
3. Implement all MVP features with working functionality
4. Apply ${design} design aesthetic
5. Ensure fully responsive
6. Add README.md with project overview
7. Initialize git repository
8. Create GitHub repo under ${account.name}: ${slug}
9. Configure GitHub Pages (use gh-pages branch or GitHub Actions)
10. Build, commit, push, and verify deployment is live
11. Test the deployed URL loads correctly

## Self-Resolution Rules
- Design ambiguity -> Choose minimal/clean option
- Feature ambiguity -> Implement simpler interpretation
- Dependency issues -> Find alternative or skip non-critical
- Build errors -> Debug and fix, don't give up
- Document all assumptions in README

## CRITICAL: Output Format
When deployment is verified working, output EXACTLY this format on its own lines:

---DEPLOYMENT_COMPLETE---
URL: [the deployed github pages url]
REPO: [the github repository url]
SUMMARY: [2-3 sentence summary of what was built and key features]
---END---
`;

    return new Promise((resolve, reject) => {
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });
      let output = '';
      let authError = false;

      const proc = spawn('claude', [
        '--print',
        '--dangerously-skip-permissions'
      ], {
        cwd: `/workspace/${accountKey}`,
        uid: FORGE_UID,
        gid: FORGE_GID,
        env: {
          ...process.env,
          HOME: FORGE_HOME,
          USER: 'forge',
          GITHUB_TOKEN: account.token,
          GH_TOKEN: account.token
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      buildQueue.setCurrentProcess(proc);

      // Track progress
      let lastProgress = 0;
      let lastUpdate = Date.now();
      const UPDATE_INTERVAL = 5000;

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        logStream.write(text);

        for (const { pattern, status, progress } of PROGRESS_PATTERNS) {
          if (pattern.test(text) && progress > lastProgress) {
            const now = Date.now();
            if (now - lastUpdate > UPDATE_INTERVAL) {
              lastProgress = progress;
              lastUpdate = now;
              updateProgress(interaction, appName, account, status, progress).catch(() => {});
            }
            break;
          }
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        logStream.write(`[STDERR] ${text}`);

        if (text.toLowerCase().includes('unauthorized') ||
            text.toLowerCase().includes('authentication') ||
            text.toLowerCase().includes('not logged in') ||
            text.toLowerCase().includes('please login') ||
            text.includes('401')) {
          authError = true;
        }
      });

      proc.on('close', (code) => {
        logStream.end();

        const buildConfig = {
          appName,
          slug,
          description,
          techStack,
          design,
          features,
          account,
          accountKey,
          logFile
        };

        if (authError) {
          buildQueue.setLastBuild(buildConfig, { error: 'Auth expired', failed: true });
          handleAuthError(interaction);
          reject(new Error('Claude Code authentication expired'));
          return;
        }

        if (output.includes('---DEPLOYMENT_COMPLETE---')) {
          const match = output.match(
            /---DEPLOYMENT_COMPLETE---\s*\n\s*URL:\s*(.+?)\s*\n\s*REPO:\s*(.+?)\s*\n\s*SUMMARY:\s*(.+?)\s*\n\s*---END---/s
          );

          if (match) {
            const result = {
              url: match[1].trim(),
              repo: match[2].trim(),
              summary: match[3].trim()
            };

            buildQueue.setLastBuild(buildConfig, result);
            handleSuccess(interaction, appName, account, techStack, result);
            resolve(result);
          } else {
            const result = {
              url: 'Could not parse URL',
              repo: `https://github.com/${account.name}/${slug}`,
              summary: 'Build completed but output format was unexpected. Check logs.'
            };

            buildQueue.setLastBuild(buildConfig, result);
            handleSuccess(interaction, appName, account, techStack, result);
            resolve(result);
          }
        } else {
          const error = new Error(
            `Build did not complete successfully (exit code: ${code}). Check logs: ${logFile}`
          );
          buildQueue.setLastBuild(buildConfig, { error: error.message, failed: true });
          handleFailure(interaction, appName, account, accountKey, error);
          reject(error);
        }
      });

      // 30 minute timeout
      setTimeout(() => {
        proc.kill('SIGTERM');
        logStream.end();
        reject(new Error('Build timed out after 30 minutes'));
      }, 30 * 60 * 1000);
    });
  },

  async handleRetryButton(interaction) {
    const lastBuild = buildQueue.getLastBuild();

    if (!lastBuild) {
      await interaction.reply({
        content: 'No recent build to retry.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    const config = lastBuild.config;
    const buildConfig = {
      ...config,
      interaction,
      executeBuild: () => this.runForge({ ...config, interaction })
    };

    await buildQueue.add(buildConfig);
  },

  async handleViewLogsButton(interaction) {
    const lastBuild = buildQueue.getLastBuild();

    if (!lastBuild || !lastBuild.config.logFile) {
      await interaction.reply({
        content: 'No logs available.',
        ephemeral: true
      });
      return;
    }

    try {
      let logs = fs.readFileSync(lastBuild.config.logFile, 'utf8');

      if (logs.length > 1900) {
        logs = '...(truncated)\n\n' + logs.slice(-1900);
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Build Logs: ${lastBuild.config.appName}`)
            .setDescription(`\`\`\`\n${logs}\n\`\`\``)
            .setColor(0x5865F2)
            .setFooter({ text: lastBuild.config.logFile })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({
        content: `Could not read logs: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

async function updateProgress(interaction, appName, account, status, progress) {
  const progressBar = createProgressBar(progress);

  try {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Forging: ${appName}`)
          .setDescription(`${status}\n\n${progressBar}`)
          .addFields(
            { name: 'Account', value: account.label, inline: true },
            { name: 'Progress', value: `${progress}%`, inline: true }
          )
          .setColor(0xFFA500)
          .setTimestamp()
      ]
    });
  } catch (e) {
    // Ignore rate limits
  }
}

async function handleSuccess(interaction, appName, account, techStack, result) {
  try {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${appName} is Live!`)
          .setDescription(result.summary)
          .addFields(
            { name: 'Live Preview', value: `[View App](${result.url})`, inline: true },
            { name: 'Repository', value: `[GitHub](${result.repo})`, inline: true },
            { name: 'Account', value: account.name, inline: true },
            { name: 'Tech Stack', value: techStack.join(', '), inline: false }
          )
          .setColor(0x57F287)
          .setFooter({ text: `IdeaForge - Deployed to ${account.name}` })
          .setTimestamp()
      ]
    });
  } catch (e) {
    console.error('Failed to send success notification:', e);
  }
}

async function handleFailure(interaction, appName, account, accountKey, error) {
  try {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Build Failed: ${appName}`)
          .setDescription(`\`\`\`${error.message}\`\`\``)
          .addFields(
            { name: 'Account', value: account.name, inline: true }
          )
          .setColor(0xED4245)
          .setTimestamp()
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`forge_retry_${accountKey}`)
            .setLabel('Retry Build')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('forge_view_logs')
            .setLabel('View Logs')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  } catch (e) {
    console.error('Failed to send failure notification:', e);
  }
}

async function handleAuthError(interaction) {
  try {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle('Authentication Required')
          .setDescription(
            'Claude Code session has expired.\n\n' +
            'Run `/auth` to re-authenticate, then try `/forge` again.'
          )
          .setColor(0xFFA500)
      ]
    });
  } catch (e) {
    console.error('Failed to send auth error notification:', e);
  }
}
