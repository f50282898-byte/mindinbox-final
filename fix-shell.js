const fs = require('fs');
let c = fs.readFileSync('src/components/Shell.tsx', 'utf8');

// Fix the iconFor usage in MobileBottomBar
c = c.replace(/<iconFor\(item\.icon\) className="size-5" aria-hidden="true" \/>/g, '{iconFor(item.icon)}');

// Fix the Icon usage in RailLink
c = c.replace(/<Icon className="size-4 shrink-0" aria-hidden="true" \/>/g, '{Icon}');

fs.writeFileSync('src/components/Shell.tsx', c);
console.log('Fixed Shell.tsx');