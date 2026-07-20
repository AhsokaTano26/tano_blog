'use client';

import { useState } from 'react';
import {
  HelpCircle, ChevronDown, ChevronRight, FileText, FolderTree, Tags,
  MessageSquare, Image, Settings, ScrollText, Database, Bookmark, Link,
  UserCircle, LayoutDashboard, Bell, Shield, KeyRound, Lock, Eye,
  Search, BarChart3, Menu, Upload, Download, RefreshCw, Globe, Mail,
  Calendar, Moon, Palette, ExternalLink, GripVertical, Filter,
  Sparkles, Music, Ban,
} from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: typeof HelpCircle;
  items: { title: string; content: string | string[] }[];
}

const sections: HelpSection[] = [
  {
    id: 'overview',
    title: '概览仪表盘',
    icon: LayoutDashboard,
    items: [
      {
        title: '仪表盘功能',
        content: [
          '概览页面 (/admin) 显示博客的核心运营数据：',
          '• 文章总览 — 文章总数、总阅读量、评论总数、系列总数',
          '• 待处理事项 — 待审核评论和待审核友链的数量提示',
          '• 每日发文量 — 最近 7 天的文章发布趋势柱状图',
          '• 热门文章 — 按阅读量排名的热门文章列表',
          '• 系统信息 — Go 版本、数据库类型、文章分类/标签数量等',
          '• 快捷操作 — 快速进入常用功能',
        ],
      },
    ],
  },
  {
    id: 'posts',
    title: '文章管理',
    icon: FileText,
    items: [
      {
        title: '文章列表',
        content: [
          '文章管理 (/admin/posts) 以表格形式列出所有文章，支持：',
          '• 批量操作 — 勾选多篇文章后批量发布、下架或删除',
          '• 状态筛选 — 按已发布/草稿/下架筛选',
          '• 搜索 — 按标题关键词搜索文章',
          '• 置顶 — 将重要文章置顶显示',
          '• 导出 — 将文章导出为 JSON 文件',
        ],
      },
      {
        title: '创建 & 编辑文章',
        content: [
          '编辑器支持完整的 Markdown 写作体验：',
          '• 分屏模式 — 同时编辑和预览，左右实时同步滚动',
          '• Mermaid 图表 — 代码块用 mermaid 语言标识，实时渲染流程图/时序图等',
          '• 拖拽上传 — 拖拽图片/文件到编辑器自动上传到媒体库',
          '• 粘贴上传 — 粘贴剪贴板图片自动上传',
          '• 媒体库选择 — 点击工具栏图片按钮从媒体库选择已上传的媒体',
          '• 分类/标签 — 为文章选择分类和标签',
          '• 系列 — 将文章归属到某个系列，并设置系列内的排序',
          '• 封面图 — 为文章设置封面图片',
          '• 密码保护 — 设置密码后访客需输入密码才能查看全文',
          '• 定时发布 — 设置未来发布日期，到时间自动发布',
          '• 摘要 — 自定义文章摘要，留空则自动截取前 200 字',
        ],
      },
      {
        title: '文章版本',
        content: [
          '每次更新文章时系统会自动保存历史版本：',
          '• 在编辑页面点击"历史版本"查看所有修订记录',
          '• 可以预览任一历史版本的内容差异',
          '• 点击"恢复"可将文章回滚到指定版本',
          '版本保留最近 20 条记录。',
        ],
      },
      {
        title: '预览令牌',
        content: [
          '草稿文章可以通过预览令牌分享给他人查看：',
          '• 在编辑页面生成唯一的预览链接',
          '• 分享链接给任何人，无需登录即可查看',
          '• 令牌可随时重新生成，旧令牌立即失效',
        ],
      },
    ],
  },
  {
    id: 'calendar',
    title: '日历',
    icon: Calendar,
    items: [
      {
        title: '文章日历',
        content: [
          '日历视图 (/admin/calendar) 以日历形式展示文章发布情况：',
          '• 每个日期显示当天发布的文章列表',
          '• 可切换月份浏览历史发布记录',
          '• 点击文章标题可直接跳转到编辑页面',
          '• 支持 URL 参数分享特定月份的视图',
        ],
      },
    ],
  },
  {
    id: 'categories',
    title: '分类管理',
    icon: FolderTree,
    items: [
      {
        title: '分类操作',
        content: [
          '分类管理 (/admin/categories) 支持：',
          '• 创建分类 — 设置名称、别名(slug)和描述',
          '• 编辑分类 — 修改分类信息',
          '• 删除分类 — 删除后该分类下的文章变为"未分类"',
          '• 分类展示 — 首页文章列表顶部会显示分类导航',
          'slug 为空时自动从名称生成。',
        ],
      },
    ],
  },
  {
    id: 'tags',
    title: '标签管理',
    icon: Tags,
    items: [
      {
        title: '标签操作',
        content: [
          '标签管理 (/admin/tags) 支持：',
          '• 创建/编辑/删除标签',
          '• 每个标签显示关联的文章数量',
          '• 前端侧边栏有标签云展示，标签大小与文章数成正比',
        ],
      },
    ],
  },
  {
    id: 'comments',
    title: '评论管理',
    icon: MessageSquare,
    items: [
      {
        title: '评论列表',
        content: [
          '评论管理 (/admin/comments) 提供完整的评论审核流程：',
          '• 状态标签 — 待审核/已批准/垃圾/spam 四个分类标签页',
          '• 批量操作 — 批量审核通过、标记垃圾或删除',
          '• 评论人信息 — 显示评论者 IP、邮箱、UA 和设备信息',
          '• 评论编辑 — 管理员可直接编辑评论内容',
          '• 历史版本 — 查看评论的修改历史',
          '• 导出 — 将评论导出为 CSV 文件',
          '侧边栏待审核评论会显示红色角标。',
        ],
      },
      {
        title: '评论表情反应',
        content: [
          '访客可以对评论添加表情反应：',
          '• 每条评论下方显示 6 个表情按钮（👍❤️😂😮😢🙏）',
          '• 点击切换选中/取消，已点赞的高亮显示',
          '• 每个表情显示反应计数',
        ],
      },
      {
        title: '评论实时预览',
        content: [
          '发表评论时支持实时 Markdown 预览：',
          '• 评论框下方有"预览"切换开关',
          '• 开启后实时渲染 Markdown 效果',
          '• 预览区域固定 200px 高度，超出可滚动',
        ],
      },
    ],
  },
  {
    id: 'blocked',
    title: '封禁管理',
    icon: Ban,
    items: [
      {
        title: 'IP 手动封禁',
        content: [
          '封禁管理 (/admin/blocked) 的"IP 封禁"标签页提供手动封禁功能：',
          '• 新增封禁 — 输入 IP 地址，选择封禁范围（可多选模块）',
          '• 封禁范围 — 支持按模块粒度控制：文章、评论、分类、标签、系列、友链、相册、音乐、搜索、登录、全站',
          '• 过期时间 — 可选设置自动解封时间，留空为永久',
          '• 自动标记 — 自动封禁的记录会标注"自动"标签',
          '• 解封 — 点击删除按钮立即解封',
          '• 表格展示 — IP 地址、封禁范围（中文标签）、原因、过期时间、类型、操作',
        ],
      },
      {
        title: '自动封禁配置',
        content: [
          '"自动封禁"标签页可配置登录失败的自动封禁策略：',
          '• 启用自动封禁 — 总开关',
          '• 失败阈值 — 在计数窗口内失败多少次触发封禁（默认 10 次）',
          '• 计数窗口 — 失败计数的有效期（默认 300 秒 / 5 分钟）',
          '• 封禁时长 — 自动封禁持续多久（默认 1800 秒 / 30 分钟）',
          '• 封禁范围 — 自动封禁时禁止哪些模块（默认只封登录）',
          '所有配置修改后需点击"保存配置"生效，无需重启服务。',
        ],
      },
    ],
  },
  {
    id: 'media',
    title: '附件管理',
    icon: Image,
    items: [
      {
        title: '媒体库',
        content: [
          '附件管理 (/admin/media) 管理所有上传的媒体文件：',
          '• 支持格式 — 图片(jpg/png/gif/webp/svg)、音频(mp3/wav/flac/aac/m4a/ogg)、视频(mp4/webm/mov/avi/mkv)',
          '• 视图切换 — 网格视图和列表视图',
          '• 标签管理 — 为媒体文件添加标签进行分类',
          '• 批量操作 — 批量删除或批量设置标签',
          '• 上传限制 — 单文件最大 100MB',
          '• 文件名显示 — 网格模式下文件名显示在缩略图下方',
          '在文章编辑器中可从媒体库选择已上传的文件直接插入。',
        ],
      },
    ],
  },
  {
    id: 'series',
    title: '系列管理',
    icon: Bookmark,
    items: [
      {
        title: '文章系列',
        content: [
          '系列管理 (/admin/series) 将相关文章组织成系列：',
          '• 创建系列 — 设置系列名称、描述和封面图',
          '• 排序 — 调整系列内文章的阅读顺序',
          '• 进度指示 — 前端文章页底部显示系列进度条（第 N 篇）',
          '• 导航 — 系列内文章间"上一篇/下一篇"跳转',
          '适合教程、连载等内容组织形式。',
        ],
      },
    ],
  },
  {
    id: 'gallery',
    title: '图片馆管理',
    icon: Image,
    items: [
      {
        title: '图片管理',
        content: [
          '图片馆管理 (/admin/gallery) 管理瀑布流展示的图片：',
          '• 新增图片 — 输入图片 URL（支持媒体库选择或外部链接）',
          '• 标题和描述 — 为每张图片设置标题和描述文字',
          '• 宽高信息 — 媒体库图片自动读取宽高，外部 URL 留空',
          '• 排序 — 上移/下移调整图片顺序',
          '• 删除 — 确认后从图片馆移除',
          '前台 /gallery 页面以 CSS columns 瀑布流展示，点击进入全屏灯箱浏览，支持键盘左右切换。',
        ],
      },
    ],
  },
  {
    id: 'links',
    title: '友链管理',
    icon: Link,
    items: [
      {
        title: '友情链接',
        content: [
          '友链管理 (/admin/links) 管理友情链接：',
          '• 待审核 — 新申请的友链默认为 pending 状态，需审核通过',
          '• 编辑 — 修改友链的名称、网址、头像和描述',
          '• 排序 — 调整友链显示顺序',
          '• 导出 — 将友链导出',
          '访客可通过前台 /links 页面的申请表单提交友链申请。',
          '侧边栏待审核友链会显示红色角标。',
        ],
      },
    ],
  },
  {
    id: 'nav-links',
    title: '导航管理',
    icon: Menu,
    items: [
      {
        title: '自定义导航',
        content: [
          '导航管理 (/admin/nav-links) 管理前台顶部导航栏：',
          '• 添加导航项 — 设置标题和链接地址',
          '• 排序 — 拖动左侧手柄调整顺序',
          '• 默认导航 — 首页/归档/友链/关于/管理 始终保留',
          '• 自定义项会自动附加在默认导航之后',
        ],
      },
    ],
  },
  {
    id: 'profile',
    title: '个人信息',
    icon: UserCircle,
    items: [
      {
        title: '个人资料',
        content: [
          '个人信息 (/admin/profile) 包含以下设置：',
          '• 基本资料 — 修改昵称、邮箱、头像、个人简介',
          '• 密码修改 — 输入旧密码和新密码修改登录密码',
          '• 两步验证 (TOTP) — 启用基于时间的一次性密码验证，增强账户安全',
          '• 通行密钥 (Passkey) — 使用生物识别或设备 PIN 快速登录，支持多设备',
          '• 密钥管理 — 重命名或删除已注册的通行密钥',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: '站点设置',
    icon: Settings,
    items: [
      {
        title: '基本设置',
        content: [
          '站点设置 (/admin/settings) 控制博客的核心配置：',
          '• 站点信息 — 标题、描述、URL、页脚文字、Favicon',
          '• 主题色 — 通过色相滑块调整网站主色调（0-360°）',
          '• 显示设置 — 每页文章数、摘要长度（字数）',
          '• 评论设置 — 是否开启评论功能',
          '• 默认主题 — 日间/夜间/跟随系统',
          '• 注入代码 — 自定义 head 和 footer 的 HTML/JavaScript',
        ],
      },
      {
        title: '邮件设置',
        content: [
          '支持配置邮件通知功能：',
          '• 启用邮件 — 开启邮件发送功能',
          '• 发送方式 — 支持 SMTP 和 Zeabur API 两种方式',
          '• 测试发送 — 配置后可以发送测试邮件验证',
          '邮件用于密码找回和评论通知等功能。',
        ],
      },
    ],
  },
  {
    id: 'logs',
    title: '访问日志',
    icon: ScrollText,
    items: [
      {
        title: '日志查询',
        content: [
          '访问日志 (/admin/access-logs) 记录所有网站访问：',
          '• 筛选 — 按路径、方法、IP、状态码和时间范围筛选',
          '• 统计概览 — 总请求数、独立 IP、错误数、平均响应时间',
          '• 趋势图 — 每日访问量趋势折线图',
          '• 多维统计 — 按国家/地区、路径、状态码、设备、浏览器、OS、时段聚合统计',
          '• 导出 CSV — 将筛选后的日志导出为 CSV 文件',
          '• 清空日志 — 一键清空所有日志记录',
          '每条日志记录 IP、国家、城市（支持 GeoIP）、设备类型、浏览器、OS 等信息。',
        ],
      },
    ],
  },
  {
    id: 'analytics',
    title: '统计分析',
    icon: BarChart3,
    items: [
      {
        title: '数据分析',
        content: [
          '统计页面 (/admin/analytics) 提供更详细的数据可视化：',
          '• 时间范围 — 可按天/周/月查看数据趋势',
          '• PV/UV — 页面浏览量(PV)和独立访客数(UV)',
          '• 设备分布 — 桌面端/平板/手机的访问比例',
          '• 浏览器分布 — Chrome/Firefox/Safari 等浏览器占比',
          '• 操作系统 — Windows/macOS/Linux/Android/iOS 分布',
          '• 地理分布 — 按国家和城市的访问量排名',
          '• 访问来源 — Referrer 来源统计',
          '• 热门路径 — 访问量最高的页面路径排名',
        ],
      },
    ],
  },
  {
    id: 'backup',
    title: '备份与恢复',
    icon: Database,
    items: [
      {
        title: '数据备份',
        content: [
          '备份管理 (/admin/backup) 确保数据安全：',
          '• 创建备份 — 一键生成数据库完整备份文件（.zip 格式）',
          '• 下载备份 — 下载已有备份文件到本地',
          '• 删除备份 — 清理不需要的旧备份',
          '备份包含所有数据库表记录和上传的媒体文件。',
        ],
      },
      {
        title: '数据恢复',
        content: [
          '支持三种恢复方式：',
          '• 上传文件 — 上传本地的备份文件进行恢复',
          '• 远程 URL — 输入远程备份文件的 URL 进行恢复',
          '• 本地文件 — 从服务器本地备份列表中选择恢复',
          '恢复操作会覆盖当前数据，操作前建议先创建备份。',
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: '消息通知',
    icon: Bell,
    items: [
      {
        title: '通知中心',
        content: [
          '通知中心 (/admin/notifications) 集中管理所有系统通知：',
          '• 新评论通知 — 有新评论时自动生成通知',
          '• 友链申请通知 — 新友链申请时通知管理员',
          '• 已读标记 — 点击通知标记为已读',
          '• 全部已读 — 一键标记所有通知为已读',
          '• 未读计数 — 侧边栏和浏览器标题显示未读数量',
          '系统每 30 秒自动轮询未读通知数。',
        ],
      },
    ],
  },
  {
    id: 'music',
    title: '音乐馆管理',
    icon: Music,
    items: [
      {
        title: '页面设置',
        content: [
          '音乐馆管理 (/admin/music-page) 的"页面设置"标签页配置公共音乐播放页面的外观：',
          '• 标题 — 页面顶部显示的大标题',
          '• 副标题 — 标题下方的副标题文字',
          '• 背景图 — 页面背景图片，支持从媒体库选择',
        ],
      },
      {
        title: '播放列表管理',
        content: [
          '"播放列表管理"标签页支持多播放列表 CRUD：',
          '• 新建播放列表 — 创建命名的播放列表',
          '• 重命名 — 修改播放列表名称',
          '• 删除 — 删除整个播放列表及其所有歌曲',
          '• 展开/折叠 — 点击播放列表查看其中的歌曲列表',
        ],
      },
      {
        title: '歌曲管理',
        content: [
          '在每个播放列表中可以管理歌曲：',
          '• 添加歌曲 — 填写标题和音频 URL（支持从媒体库选择或上传）',
          '• 歌曲行 — 序号、封面小图、标题、艺术家、上移/下移/删除',
          '• 拖拽排序 — 拖拽调整歌曲播放顺序',
          '• 点击编辑 — 点击歌曲行弹出详情弹窗编辑所有字段',
        ],
      },
      {
        title: '歌曲详情编辑',
        content: [
          '弹窗内可编辑歌曲的完整信息，修改即生效：',
          '• 标题 — 歌曲名称',
          '• 艺术家 — 演唱者/创作者',
          '• 封面图 — 歌曲封面图片，支持从媒体库选择',
          '• 音频 URL — 音乐文件地址，支持媒体库选择和上传',
          '• 背景图 — 播放此曲时的独立背景图',
          '音频 URL 填写后自动填充封面图（如未手动设置过）。',
        ],
      },
    ],
  },
  {
    id: 'frontend',
    title: '前台功能',
    icon: Globe,
    items: [
      {
        title: '浏览体验',
        content: [
          '前台提供丰富的浏览功能：',
          '• 主题色自定义 — 顶部导航栏色相滑块可自由调整主题色，所有访客可独立设置',
          '• 日夜模式 — 日间/夜间/跟随系统三种模式切换',
          '• 文章日历 — 侧边栏日历小部件显示有文章的日期',
          '• 标签云 — 侧边栏标签云展示所有标签，字号与文章数关联',
          '• 系列导航 — 文章页底部显示所属系列及进度',
          '• 上一篇/下一篇 — 文章底部按发布时间跳转相邻文章',
          '• 猜你喜欢 — 文章底部基于标签匹配推荐最多 6 篇相关文章',
          '• 图片馆 — /gallery 瀑布流图片展示，点击进入全屏灯箱',
          '• 音乐馆 — /music 全屏音乐播放器，频谱可视化 + 粒子动画',
          '• 评论表情反应 — 对评论点赞/添加表情反应',
          '• 实时预览 — 发表评论时实时预览 Markdown 效果',
          '• 搜索 — 支持按关键词搜索文章标题和内容',
          '• 代码块复制 — 代码块顶栏显示语言类型和一键复制按钮',
          '• Mermaid 图表 — 代码块使用 mermaid 语言标识可渲染图表',
          '• 友链页面 — /links 展示友情链接列表',
          '• 日历页面 — /calendar 日历视图浏览文章',
        ],
      },
      {
        title: '文章互动',
        content: [
          '访客可以与文章和评论互动：',
          '• 文章表情 — 对文章添加表情反应（点赞等）',
          '• 评论回复 — 支持对评论进行回复，形成讨论串',
          '• Markdown 评论 — 评论支持 Markdown 格式和 LaTeX 数学公式',
          '• 评论排序 — 按时间正序/倒序浏览评论',
        ],
      },
    ],
  },
];

function HelpItem({ title, content, defaultOpen }: { title: string; content: string | string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false);

  return (
    <div className="mb-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-white/5 cursor-pointer"
        style={{ color: 'var(--text-primary)' }}
      >
        <span>{title}</span>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-info)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-info)' }} />}
      </button>
      {open && (
        <div className="px-4 pb-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {Array.isArray(content) ? (
            <div className="space-y-1">
              {content.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : (
            <p>{content}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminHelp() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  const currentSection = sections.find(s => s.id === activeSection) || sections[0];

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <HelpCircle className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>帮助中心</h1>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar navigation */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="glass-card rounded-xl p-2 sticky top-6">
            {sections.map(s => {
              const Icon = s.icon;
              const isActive = s.id === activeSection;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-all cursor-pointer mb-0.5"
                  style={{
                    background: isActive ? 'var(--primary-sub)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <currentSection.icon className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{currentSection.title}</h2>
            </div>
            <div>
              {currentSection.items.map((item, i) => (
                <HelpItem key={i} title={item.title} content={item.content} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
