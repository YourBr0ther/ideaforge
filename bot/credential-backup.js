const fs = require('fs');
const path = require('path');

const CRED_DIR = '/root/.claude';
const BACKUP_DIR = '/config/claude-auth-backup';
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // Every 6 hours

class CredentialBackup {
  constructor() {
    this.startBackupSchedule();
  }

  startBackupSchedule() {
    this.backup();
    setInterval(() => this.backup(), BACKUP_INTERVAL);
  }

  backup() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const files = ['.credentials.json', 'settings.local.json'];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      for (const file of files) {
        const src = path.join(CRED_DIR, file);
        if (fs.existsSync(src)) {
          const dst = path.join(BACKUP_DIR, file);
          fs.copyFileSync(src, dst);

          const dstTimestamped = path.join(BACKUP_DIR, `${timestamp}-${file}`);
          fs.copyFileSync(src, dstTimestamped);
        }
      }

      this.cleanupOldBackups();
      console.log(`Credentials backed up at ${timestamp}`);
    } catch (error) {
      console.error('Credential backup failed:', error);
    }
  }

  cleanupOldBackups() {
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.includes('-credentials.json'))
        .sort()
        .reverse();

      for (const file of files.slice(5)) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  restore() {
    try {
      const files = ['.credentials.json', 'settings.local.json'];

      for (const file of files) {
        const src = path.join(BACKUP_DIR, file);
        const dst = path.join(CRED_DIR, file);

        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          fs.mkdirSync(CRED_DIR, { recursive: true });
          fs.copyFileSync(src, dst);
          console.log(`Restored ${file} from backup`);
        }
      }
    } catch (error) {
      console.error('Credential restore failed:', error);
    }
  }
}

module.exports = new CredentialBackup();
