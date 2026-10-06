const fs = require('fs');
let c = fs.readFileSync('src/components/Header.tsx', 'utf8');

// Fix the iconFor usage in MobileBottomBar
c = c.replace(/<iconFor\(item\.icon\) className="size-5" \/>/g, '{iconFor(item.icon)}');

// Fix the Icon usage in DesktopHeader
c = c.replace(/<Icon className="size-4 shrink-0" aria-hidden="true" \/>/g, '{Icon}');

fs.writeFileSync('src/components/Header.tsx', c);
console.log('Fixed Header.tsx');