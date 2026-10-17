const crypto = require('node:crypto');

if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  console.error('Run this command in an interactive terminal so the password is not echoed.');
  process.exit(1);
}

let password = '';
process.stdout.write('Enter the admin password (12 or more characters): ');
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (input) => {
  for (const character of input) {
    if (character === '\u0003') {
      process.stdout.write('\n');
      process.exit(1);
    }
    if (character === '\r' || character === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (password.length < 12) {
        console.error('Use a password with at least 12 characters.');
        process.exitCode = 1;
        return;
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      console.log(`ADMIN_PASSWORD_HASH=scrypt$${salt}$${hash}`);
      password = '';
      return;
    }
    if (character === '\u007f' || character === '\b') password = password.slice(0, -1);
    else if (character >= ' ') password += character;
  }
});
