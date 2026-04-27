const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('functions/api');

files.forEach(file => {
    if (file.includes('_shared/log.js')) return;
    
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    if (content.includes('console.error(') || content.includes('console.warn(')) {
        // Need to add import { logError, logWarn } from ...
        let relativePath = path.relative(path.dirname(file), 'functions/api/_shared/log.js');
        if (!relativePath.startsWith('.')) relativePath = './' + relativePath;
        
        // Naive string replace for common patterns
        content = content.replace(/console\.error\((['"`].+?['"`]), (errText|body|payload)\)/g, "logError($1, $2)");
        content = content.replace(/console\.error\((['"`].+?['"`]), res\.status, (errText|body|payload)\)/g, "logError($1, $3, { status: res.status })");
        content = content.replace(/console\.error\((['"`].+?['"`]), errText\)/g, "logError($1, errText)");
        
        // Ensure we add the import if we made replacements
        if (content !== original && !content.includes('import { logError')) {
            content = `import { logError, logWarn } from '${relativePath}';\n` + content;
            fs.writeFileSync(file, content, 'utf8');
        }
    }
});
