const fs = require('fs');
let c = fs.readFileSync('src/components/ViewTransitions.tsx', 'utf8');

// Fix the onClick handler - move className and href inside the <a> tag
// The issue is that className and href are placed after the onClick handler's closing brace
// They should be inside the opening <a> tag

c = c.replace(
  /onClick=\{(e: React\.MouseEvent<HTMLAnchorElement>\) => \{[\s\S]*?\}\s*className=\{className\}\s*href=\{href\}\s*>/g,
  'onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as React.MouseEvent<HTMLAnchorElement>).button !== 0) {            return;          }          if (onClick) onClick(e);        }} className={className} href={href}>'
);

fs.writeFileSync('src/components/ViewTransitions.tsx', c);
console.log('Fixed ViewTransitions.tsx');