/* eslint-disable @typescript-eslint/no-require-imports */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { api, ApiError } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const click = async text => { assert.equal(Boolean(button(text)), true, `Missing button: ${text}`); await act(async () => button(text).click()); };
const alerts = () => [...document.querySelectorAll('[role=alert]')].map(node => node.textContent).join('\n');
const config = { site_title: 'Loaded settings', music_page_config: '{"title":"Loaded music","playlists":[]}' };
const user = { id: 'admin', username: 'admin', display_name: 'Loaded profile', email: '', role: 'admin', totp_enabled: false };
async function mount(t, route, props = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const Component = typeof route === 'string' ? require('../src/app/admin/' + route + '/page.tsx').default : route;
  await act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(Component, props))));
}

for (const route of ['settings', 'music-page']) {
  test(`${route} failed initial config is visible, blocks blank saves, and retries`, async t => {
    t.mock.method(api.admin, 'checkVersion', async () => ({ latest: '' }));
    let failed = true;
    t.mock.method(api.admin.config, 'get', async () => { if (failed) throw new Error('configuration offline'); return { config }; });
    await mount(t, route);
    assert.match(alerts(), /configuration offline/);
    assert.equal(!button('保存设置') || button('保存设置').disabled, true);
    failed = false;
    await click('重试');
    assert.equal(alerts(), '');
    assert.equal([...document.querySelectorAll('input')].some(node => node.value === (route === 'settings' ? 'Loaded settings' : 'Loaded music')), true);
  });
}

test('music save exposes standby rejection and preserves the edited title', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config }));
  t.mock.method(api.admin.config, 'update', async () => { throw new ApiError('备服务器为只读模式，请在主服务器执行编辑操作', 503); });
  await mount(t, 'music-page');
  await act(async () => input(document.querySelector('input'), 'Keep music draft'));
  await click('保存设置');
  assert.match(alerts(), /备服务器.*HTTP 503/);
  assert.equal(document.querySelector('input').value, 'Keep music draft');
});

test('confirmed music saves remain successful when configuration refresh fails', async t => {
  let saved = false;
  t.mock.method(api.admin.config, 'get', async () => { if (saved) throw new Error('refresh offline'); return { config }; });
  t.mock.method(api.admin.config, 'update', async () => { saved = true; });
  await mount(t, 'music-page');
  await click('保存设置');
  assert.match(document.body.textContent, /已保存/);
  assert.match(alerts(), /refresh offline/);
});

test('calendar load failures show a reason and recover with retry', async t => {
  let failed = true;
  t.mock.method(api.admin.posts, 'calendar', async () => { if (failed) throw new Error('calendar offline'); return { items: [] }; });
  await mount(t, 'calendar');
  assert.match(alerts(), /calendar offline/);
  failed = false;
  await click('重试');
  assert.equal(alerts(), '');
});

test('notification failures do not masquerade as an empty inbox', async t => {
  let failed = true;
  t.mock.method(api, 'getNotifications', async () => { if (failed) throw new Error('inbox offline'); return { items: [], total: 0 }; });
  await mount(t, 'notifications');
  assert.match(alerts(), /inbox offline/);
  assert.doesNotMatch(document.body.textContent, /暂无通知/);
  failed = false;
  await click('重试');
  assert.match(document.body.textContent, /暂无通知/);
});

test('notification read rejection remains visible and keeps unread content', async t => {
  t.mock.method(api, 'getNotifications', async () => ({ items: [{ id: 'one', title: 'Unread notification', type: 'login', is_read: false, created_at: '2026-10-22T00:00:00Z' }], total: 1 }));
  t.mock.method(api, 'markAllNotificationsRead', async () => { throw new ApiError('备服务器为只读模式', 503); });
  await mount(t, 'notifications');
  await click('全部标记已读');
  assert.match(alerts(), /备服务器.*HTTP 503/);
  assert.match(document.body.textContent, /Unread notification/);
});

function backupMocks(t) {
  t.mock.method(api.admin.backups, 'status', async () => ({ running: false, phase: '', table: '', rows: 0, bytes: 0 }));
}
test('backup list failures keep the server reason and offer retry', async t => {
  backupMocks(t);
  let failed = true;
  t.mock.method(api.admin.backups, 'list', async () => { if (failed) throw new Error('backup list offline'); return { items: [] }; });
  await mount(t, 'backup');
  assert.match(alerts(), /backup list offline/);
  failed = false;
  await click('重试');
  assert.equal(alerts(), '');
});

test('a completed backup remains confirmed when refreshing its list fails', async t => {
  backupMocks(t);
  let created = false;
  t.mock.method(api.admin.backups, 'list', async () => { if (created) throw new Error('backup refresh offline'); return { items: [] }; });
  t.mock.method(api.admin.backups, 'create', async () => { created = true; return { filename: 'backup-confirmed.zip' }; });
  await mount(t, 'backup');
  await click('创建备份');
  assert.match(document.body.textContent, /备份创建成功.*backup-confirmed.zip/);
  assert.match(alerts(), /backup refresh offline/);
});

test('backup progress failures remain visible rather than appearing idle', async t => {
  backupMocks(t);
  t.mock.method(api.admin.backups, 'status', async () => { throw new Error('progress offline'); });
  t.mock.method(api.admin.backups, 'list', async () => ({ items: [] }));
  await mount(t, 'backup');
  assert.match(alerts(), /progress offline/);
});

test('profile initial failures display a retry instead of an empty editable profile', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config }));
  let failed = true;
  t.mock.method(api, 'getMe', async () => { if (failed) throw new Error('profile offline'); return user; });
  await mount(t, 'profile');
  assert.match(alerts(), /profile offline/);
  failed = false;
  await click('重试');
  assert.equal([...document.querySelectorAll('input')].some(node => node.value === 'Loaded profile'), true);
});

test('passkey loading failures are exposed with retry', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config }));
  t.mock.method(api, 'getMe', async () => user);
  let failed = true;
  t.mock.method(api, 'passkeysList', async () => { if (failed) throw new Error('passkeys offline'); return []; });
  await mount(t, 'profile');
  await click('通行密钥');
  assert.match(alerts(), /passkeys offline/);
  failed = false;
  await click('重试');
  assert.equal(alerts(), '');
});

function editorMocks(t) {
  t.mock.method(api, 'getCategories', async () => ({ items: [] }));
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  t.after(() => localStorage.clear());
}
const article = { id: 'error-fixture', title: 'Editor fixture', slug: 'error-fixture', content: 'Keep this body', status: 'draft', updated_at: '2026-10-22T00:00:00Z' };

test('editor metadata failures are visible and retry without losing body text', async t => {
  editorMocks(t);
  let failed = true;
  t.mock.method(api, 'getCategories', async () => { if (failed) throw new Error('categories offline'); return { items: [] }; });
  await mount(t, require('../src/components/PostEditor.tsx').default, { post: article, onClose() {} });
  assert.match(alerts(), /categories offline/);
  failed = false;
  await click('重试');
  assert.equal(alerts(), '');
  assert.equal(document.querySelector('textarea[placeholder^="输入 Markdown"]').value, 'Keep this body');
});

test('revision failures do not masquerade as missing history', async t => {
  editorMocks(t);
  t.mock.method(api.admin.posts.revisions, 'list', async () => { throw new Error('revisions offline'); });
  await mount(t, require('../src/components/PostEditor.tsx').default, { post: article, onClose() {} });
  await act(async () => document.querySelector('[aria-label="切换侧边栏"]').click());
  await click('历史');
  assert.match(alerts(), /revisions offline/);
  assert.doesNotMatch(document.body.textContent, /暂无修订历史/);
});

test('preview generation rejection retains its reason in the wrapped alert', async t => {
  editorMocks(t);
  t.mock.method(api.admin.posts, 'generatePreviewToken', async () => { throw new ApiError('备服务器为只读模式', 503); });
  await mount(t, require('../src/components/PostEditor.tsx').default, { post: article, onClose() {} });
  await act(async () => document.querySelector('[aria-label="复制预览链接"]').click());
  assert.match(document.querySelector('[role=alertdialog]')?.textContent || '', /备服务器.*HTTP 503/);
});

test('media field upload rejection is shown next to the unchanged field', async t => {
  const { MediaField } = require('../src/components/MediaField.tsx');
  t.mock.method(api.admin.media, 'upload', async () => { throw new ApiError('备服务器为只读模式', 503); });
  await mount(t, MediaField, { value: '/old-image.png', onChange() { assert.fail('a rejected upload must not change the selected image'); } });
  const picker = document.querySelector('input[type=file]');
  Object.defineProperty(picker, 'files', { configurable: true, value: [new window.File(['image'], 'image.png', { type: 'image/png' })] });
  await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })));
  assert.match(alerts(), /备服务器.*HTTP 503/);
  assert.equal(document.querySelector('input[type=text]').value, '/old-image.png');
});

test('media picker tag failures stay visible and can be retried', async t => {
  const { MediaPickerModal } = require('../src/components/MediaField.tsx');
  t.mock.method(api.admin.media, 'list', async () => ({ items: [], total: 0, page: 1, size: 30 }));
  let failed = true;
  t.mock.method(api.admin.media.tags, 'list', async () => { if (failed) throw new Error('media tags offline'); return { items: [] }; });
  await mount(t, MediaPickerModal, { onSelect() {}, onClose() {} });
  assert.match(alerts(), /media tags offline/);
  failed = false;
  await click('重试');
  assert.equal(alerts(), '');
});

test('version-check failures expose the reason and support retry', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config }));
  let failed = true;
  t.mock.method(api.admin, 'checkVersion', async () => { if (failed) throw new Error('release service offline'); return { latest: 'v99.0.0', changelog: ['Recovered release'] }; });
  await mount(t, 'settings');
  await click('关于');
  assert.match(alerts(), /release service offline/);
  failed = false;
  await click('重试');
  assert.match(document.body.textContent, /v99.0.0/);
});

test('copying a TOTP secret reports clipboard rejection instead of success', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config }));
  t.mock.method(api, 'getMe', async () => user);
  t.mock.method(api, 'setupTOTP', async () => ({ secret: 'JBSWY3DPEHPK3PXP', qr_code: 'otpauth://totp/Fixture' }));
  t.mock.method(require('qrcode'), 'toDataURL', async () => 'data:image/png;base64,fixture');
  const previous = Object.getOwnPropertyDescriptor(global.navigator, 'clipboard');
  Object.defineProperty(global.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('clipboard unavailable'); } } });
  t.after(() => { if (previous) Object.defineProperty(global.navigator, 'clipboard', previous); else delete global.navigator.clipboard; });
  await mount(t, 'profile');
  await click('两步验证');
  await click('开始设置');
  const secret = [...document.querySelectorAll('span')].find(node => node.textContent === 'JBSWY3DPEHPK3PXP');
  await act(async () => secret.click());
  assert.match(alerts(), /clipboard unavailable/);
  assert.doesNotMatch(document.body.textContent, /密钥已复制/);
});

for (const route of ['settings', 'music-page']) {
  test(`${route} preserves edits entered while a confirmed save is pending`, async t => {
    t.mock.method(api.admin, 'checkVersion', async () => ({ latest: '' }));
    let stored = { ...config }, finishSave;
    t.mock.method(api.admin.config, 'get', async () => ({ config: stored }));
    t.mock.method(api.admin.config, 'update', payload => {
      stored = { ...stored, ...payload };
      return new Promise(resolve => { finishSave = resolve; });
    });
    await mount(t, route);
    await act(async () => input(document.querySelector('input'), 'Submitted draft'));
    await click('保存设置');
    await act(async () => input(document.querySelector('input'), 'Newer unsaved draft'));
    await act(async () => finishSave());
    assert.equal(document.querySelector('input').value, 'Newer unsaved draft');
    assert.match(document.body.textContent, /未保存/);
  });
}

test('email rejection is an error alert even when the server reason has no failure keyword', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config }));
  t.mock.method(api.admin, 'checkVersion', async () => ({ latest: '' }));
  t.mock.method(api.admin.config, 'testEmail', async () => { throw new ApiError('备服务器为只读模式', 503); });
  await mount(t, 'settings');
  await click('邮件通知');
  await click('发送测试邮件');
  assert.match(alerts(), /备服务器.*HTTP 503/);
});

test('terminal backup failure returned with HTTP success stays visible', async t => {
  t.mock.method(api.admin.backups, 'status', async () => ({ running: false, phase: 'failed', table: '', rows: 0, bytes: 0, error: 'background backup failed' }));
  t.mock.method(api.admin.backups, 'list', async () => ({ items: [] }));
  await mount(t, 'backup');
  assert.match(alerts(), /background backup failed/);
});

for (const route of ['settings', 'music-page']) {
  test(`${route} a previous success timer cannot erase a later failure`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(api.admin, 'checkVersion', async () => ({ latest: '' }));
    t.mock.method(api.admin.config, 'get', async () => ({ config }));
    let failed = false;
    t.mock.method(api.admin.config, 'update', async () => { if (failed) throw new ApiError('备服务器为只读模式', 503); });
    await mount(t, route);
    await click('保存设置');
    await act(async () => t.mock.timers.tick(2000));
    failed = true;
    await click('保存设置');
    await act(async () => t.mock.timers.tick(2000));
    assert.match(alerts(), /备服务器.*HTTP 503/);
  });
}
