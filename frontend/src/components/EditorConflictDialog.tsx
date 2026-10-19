import type { Post } from '@/lib/api';
import { draftFromPost, type EditorDraft } from '@/lib/editor-draft';

const fields: { key: keyof EditorDraft; label: string }[] = [
  { key: 'title', label: '标题' }, { key: 'slug', label: '地址' }, { key: 'content', label: '正文' },
  { key: 'excerpt', label: '摘要' }, { key: 'coverImage', label: '封面' }, { key: 'categoryId', label: '分类' },
  { key: 'tagIds', label: '标签' }, { key: 'status', label: '发布状态' }, { key: 'isTop', label: '置顶' },
  { key: 'allowComment', label: '允许评论' }, { key: 'authorName', label: '作者' },
  { key: 'selectedSeriesId', label: '系列' }, { key: 'scheduledAt', label: '定时发布' },
  { key: 'createdAt', label: '创建时间' }, { key: 'passwordHint', label: '密码提示' },
];

function display(value: EditorDraft[keyof EditorDraft]): string {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.join('、') || '（无）';
  return value || '（空）';
}

export default function EditorConflictDialog({ currentPost, localDraft, saving, onLoadServer, onKeepLocal }: {
  currentPost: Post;
  localDraft: EditorDraft;
  saving: boolean;
  onLoadServer: () => void;
  onKeepLocal: () => void;
}) {
  const server = draftFromPost(currentPost);
  const changed = fields.filter(({ key }) => JSON.stringify(server[key]) !== JSON.stringify(localDraft[key]));
  return (
    <section role="region" aria-label="文章版本冲突" className="mx-4 mt-3 p-4 rounded-xl glass-card flex-shrink-0 max-h-[45vh] overflow-y-auto"
      style={{ color: 'var(--text-primary)', borderLeft: '3px solid var(--color-error)' }}>
      <h2 className="font-semibold">文章已在其他窗口更新</h2>
      <p className="text-sm mt-1">本地修改已保留。请检查以下差异；确认保留本地会使用本地文章和设置更新服务器。</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>服务器更新时间：{currentPost.updated_at || '未知'}；访问密码不会显示在比较中。</p>
      <p className="text-xs mt-1">服务器访问保护：{currentPost.password_set ? '已启用' : '未启用'}；本地操作：{localDraft.passwordCleared ? '清除访问密码' : localDraft.passwordNeedsReentry ? '更新访问密码' : '保持服务器设置'}。</p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs table-fixed min-w-[28rem]">
          <thead><tr><th className="w-20 text-left p-2">字段</th><th className="text-left p-2">服务器版本</th><th className="text-left p-2">本地版本</th></tr></thead>
          <tbody>{changed.map(({ key, label }) => <tr key={key} style={{ borderTop: '1px solid var(--glass-border)' }}>
            <th className="align-top text-left p-2 font-medium">{label}</th>
            <td className="align-top p-2"><pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-inherit">{display(server[key])}</pre></td>
            <td className="align-top p-2"><pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-inherit">{display(localDraft[key])}</pre></td>
          </tr>)}</tbody>
        </table>
      </div>
      {changed.length === 0 && <p className="text-sm mt-2">正文与可见设置一致，但服务器版本已经变化。</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" disabled={saving} onClick={onLoadServer} className="px-3 py-2 rounded-lg btn-glass text-sm disabled:opacity-50">载入服务器版本</button>
        <button type="button" disabled={saving || !currentPost.updated_at} onClick={onKeepLocal}
          className="px-3 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: 'var(--primary)' }}>确认保留本地并重试</button>
      </div>
    </section>
  );
}
