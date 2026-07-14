// 同步每日一句: src/data/quotes.json → public/quotes.json
// 用 node 而不是 cp,保证 Windows cmd / PowerShell / Git Bash / Mac / Linux 都能跑
import fs from 'fs';
fs.copyFileSync('src/data/quotes.json', 'public/quotes.json');
