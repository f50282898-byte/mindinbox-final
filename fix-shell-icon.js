const fs = require('fs');
let c = fs.readFileSync('src/components/Shell.tsx', 'utf8');
c = c.replace('{iconFor(item.icon)}', '{(() => { const Icon = iconFor(item.icon); return <Icon className="size-5" />; })()}');
fs.writeFileSync('src/components/Shell.tsx', c);
console.log('Fixed Shell.tsx');