import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;

    for (const name of readdirSync(next)) {
      if (name === '.next' || name === 'node_modules' || name === '.git') continue;

      const abs = path.join(next, name);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        stack.push(abs);
        continue;
      }

      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) continue;
      out.push(abs);
    }
  }

  return out;
}

describe('src retirement', () => {
  test('application code has no imports from src directory', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const roots = ['app', 'components', 'lib'].map((part) => path.join(repoRoot, part));
    const files = roots.flatMap((root) => {
      try {
        return walkFiles(root);
      } catch {
        return [];
      }
    });

    const offenders: Array<{ file: string; match: string }> = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const patterns = [
        /(from|import)\s+['"]@\/src\//,
        /(from|import)\s+['"]\.\.\/src\//,
        /(from|import)\s+['"]\.\/src\//,
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          offenders.push({
            file: path.relative(repoRoot, file),
            match: pattern.source,
          });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
