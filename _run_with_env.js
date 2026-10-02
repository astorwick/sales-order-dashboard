const fs = require('fs');
for (const rawLine of fs.readFileSync('.env', 'utf8').split('\n')) {
  const line = rawLine.trim();
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
// Drop this wrapper from argv so the wrapped script sees its own args at process.argv.slice(2)
process.argv.splice(1, 1);
require('./' + process.argv[1]);
