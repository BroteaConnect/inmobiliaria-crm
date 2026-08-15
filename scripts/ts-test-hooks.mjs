// Module hooks that let `node --test` load the app's TypeScript modules.
//
// The app is TypeScript, but the only test runner available is `node --test`
// (the factory forbids casual new dependencies, so there is no vitest here).
// This Node build is not compiled with TypeScript support — `--strip-types`
// throws ERR_NO_TYPESCRIPT — so a `.test.mjs` cannot import a `.ts` module on
// its own. Rather than rewriting the pure modules as JavaScript and losing
// their types, we transpile on the fly with the `typescript` compiler that is
// already a devDependency of this repo.
//
// Types are ERASED, not checked: `tsc --noEmit` in `npm test` is what checks
// them. This hook only has to produce runnable JavaScript.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * TypeScript sources import each other without a file extension
 * (`moduleResolution: bundler`), which Node cannot resolve. Try the plain
 * specifier first so nothing else changes, then fall back to `<specifier>.ts`.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.')) throw err;
    return next(`${specifier}.ts`, context);
  }
}

export async function load(url, context, next) {
  if (!url.endsWith('.ts')) return next(url, context);
  const source = await readFile(fileURLToPath(url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  });
  return { format: 'module', shortCircuit: true, source: outputText };
}
