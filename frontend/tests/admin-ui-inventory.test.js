/* eslint-disable @typescript-eslint/no-require-imports -- Audit real TSX syntax rather than matching sample strings. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = path.join(__dirname, '../src');
const shared = ['ConfirmDialog', 'PostEditor', 'PostDetailDialog', 'GalleryEditDialog', 'EditorImageDialog', 'SeriesSelect', 'MediaField', 'SystemHealth', 'RequestStatistics', 'RequestTrendChart'];
const files = fs.readdirSync(path.join(source, 'app/admin'), { recursive: true })
  .filter(file => file.endsWith('.tsx')).map(file => path.join(source, 'app/admin', file))
  .concat(shared.map(name => path.join(source, 'components', name + '.tsx')));

test('all admin form controls, media controls and browser popups use the shared UI layer', () => {
  const violations = [];
  for (const filename of files) {
    const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const report = (node, reason) => violations.push(`${path.relative(source, filename)}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${reason}`);
    const visit = node => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast);
        if (['select', 'option', 'input', 'textarea', 'dialog', 'progress', 'meter', 'details', 'summary'].includes(tag)) report(node, `unwrapped <${tag}>`);
        for (const prop of node.attributes.properties) {
          if (!ts.isJsxAttribute(prop)) continue;
          if (prop.name.getText(ast) === 'title' && /^[a-z]/.test(tag)) report(prop, 'native tooltip');
          if (prop.name.getText(ast) === 'controls' && ['audio', 'video'].includes(tag)) report(prop, 'native media controls');
        }
      }
      if (ts.isCallExpression(node) && /^window\.(alert|confirm|prompt)$/.test(node.expression.getText(ast))) report(node, 'browser popup');
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  assert.deepEqual(violations, []);
});
