const fs = require('fs');
let c = fs.readFileSync('src/components/ViewTransitions.tsx', 'utf8');

// Find the problematic section and replace it
const searchStr = `      }
      className={className}
      href={href}
    >`;

const replaceStr = `      }}
      className={className}
      href={href}
    >`;

c = c.replace(searchStr, replaceStr);

fs.writeFileSync('src/components/ViewTransitions.tsx', c);
console.log('Fixed ViewTransitions.tsx');