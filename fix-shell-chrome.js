const fs = require('fs');
let c = fs.readFileSync('src/components/ShellChrome.tsx', 'utf8');
c = c.replace(
  "import { Header, MobileHeader } from \"@/components/Header\";",
  'import { DesktopHeader, MobileHeader } from "@/components/Header";'
);
c = c.replace('<Header />', '<DesktopHeader />');
fs.writeFileSync('src/components/ShellChrome.tsx', c);
console.log('Fixed ShellChrome.tsx');