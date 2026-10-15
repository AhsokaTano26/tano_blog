/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests use the CommonJS TypeScript loader. */
const fs = require('node:fs');
const ts = require('typescript');

// Reuse the project's TypeScript compiler so these regression tests need no
// additional runtime or test framework.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
