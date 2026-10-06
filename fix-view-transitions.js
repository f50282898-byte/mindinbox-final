const fs = require('fs');
let c = fs.readFileSync('src/components/ViewTransitions.tsx', 'utf8');

// Fix the anchor tag spread issue
c = c.replace('{href={href}', 'href={href}');

// Fix the closing tag issue
c = c.replace('</a>);', '</a>);');

fs.writeFileSync('src/components/ViewTransitions.tsx', c);
console.log('Fixed ViewTransitions.tsx');