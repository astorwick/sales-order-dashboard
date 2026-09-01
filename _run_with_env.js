const fs = require('fs');
for (const rawLine of fs.readFileSync('.env', 'utf8').split('\n')) {
  const line = rawLine.trim();
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
require('./' + process.argv[2]);
