import { BANGDREAM_STICKERS } from './bangdream-stickers';

export interface EmojiOption {
  emoji: string;
  name: string;
  category: string;
  keywords: string;
  asset?: string;
}

// Keep the catalogue local and small; names also provide accessible button labels.
const groups = [
  { name: '笑脸', items: [
    ['😀', '开心'], ['😃', '笑脸'], ['😄', '大笑'], ['😁', '嘻嘻'], ['😅', '笑哭冒汗'],
    ['😂', '笑哭'], ['🤣', '笑到打滚'], ['😊', '微笑'], ['😇', '天使'], ['🙂', '浅笑'],
    ['😌', '满足'], ['😉', '眨眼'], ['🤗', '抱抱'], ['😜', '调皮'], ['😝', '吐舌'],
    ['🤑', '发财'], ['🤩', '崇拜'], ['🥳', '派对'], ['😎', '酷'], ['🥸', '伪装'],
    ['😮', '惊讶'], ['😢', '难过'],
  ] },
  { name: '情感', items: [
    ['❤️', '爱心'], ['🧡', '橙心'], ['💛', '黄心'], ['💚', '绿心'], ['💙', '蓝心'],
    ['💜', '紫心'], ['🖤', '黑心'], ['🤍', '白心'], ['🤎', '棕心'], ['💕', '两颗心'],
    ['💗', '心动'], ['💖', '闪亮的心'], ['💝', '心意礼物'], ['😍', '喜欢'], ['🥰', '幸福'],
    ['😘', '飞吻'], ['😻', '爱心猫'], ['💔', '心碎'], ['💞', '心心相印'], ['✨', '闪耀'],
  ] },
  { name: '手势', items: [
    ['👍', '赞'], ['👎', '踩'], ['👊', '碰拳'], ['✊', '加油'], ['🤛', '左拳'],
    ['🤜', '右拳'], ['👏', '鼓掌'], ['🙌', '欢呼'], ['🤝', '握手'], ['🙏', '感谢'],
    ['✌️', '胜利'], ['🤞', '好运'], ['💪', '力量'], ['🤙', '打电话'], ['👋', '挥手'],
    ['🖐️', '张开手'], ['✋', '举手'], ['💅', '美甲'], ['👆', '向上'], ['👇', '向下'],
  ] },
  { name: '符号', items: [
    ['🔥', '火热'], ['⭐', '星星'], ['🌈', '彩虹'], ['☀️', '太阳'], ['☁️', '云朵'],
    ['⛄', '雪人'], ['💯', '满分'], ['🎯', '命中'], ['✅', '完成'], ['❌', '错误'],
    ['💡', '灵感'], ['💢', '生气'], ['💥', '爆炸'], ['💫', '眩晕'], ['🕐', '时钟'],
    ['🎵', '音符'], ['🎶', '音乐'], ['👑', '王冠'], ['💎', '钻石'], ['🎉', '庆祝'],
  ] },
  { name: '动物', items: [
    ['🐶', '小狗'], ['🐱', '小猫'], ['🐼', '熊猫'], ['🐨', '考拉'], ['🐯', '老虎'],
    ['🦁', '狮子'], ['🐮', '奶牛'], ['🐷', '小猪'], ['🐸', '青蛙'], ['🐵', '猴子'],
    ['🐔', '小鸡'], ['🐧', '企鹅'], ['🐦', '小鸟'], ['🦆', '鸭子'], ['🦅', '老鹰'],
    ['🦉', '猫头鹰'], ['🦇', '蝙蝠'], ['🐺', '狼'], ['🐝', '蜜蜂'], ['🦋', '蝴蝶'],
  ] },
  { name: '食物', items: [
    ['🍎', '苹果'], ['🍊', '橘子'], ['🍋', '柠檬'], ['🍌', '香蕉'], ['🍉', '西瓜'],
    ['🍇', '葡萄'], ['🍓', '草莓'], ['🫐', '蓝莓'], ['🍈', '甜瓜'], ['🍒', '樱桃'],
    ['🍑', '桃子'], ['🥝', '猕猴桃'], ['🍅', '番茄'], ['🥑', '牛油果'], ['🍔', '汉堡'],
    ['🍕', '披萨'], ['🥪', '三明治'], ['🌮', '玉米卷'], ['🍦', '冰淇淋'], ['🍩', '甜甜圈'],
  ] },
];
const aliases: Record<string, string> = {
  '👍': '点赞 赞同 支持 good like thumbs', '❤️': '红心 喜爱 love heart',
  '😂': '好笑 哈哈 laugh joy', '😮': '震惊 哇 wow', '😢': '伤心 哭泣 sad cry',
  '🙏': '谢谢 拜托 祈祷 thanks', '🌈': 'rainbow', '🎉': '撒花 celebrate',
};
export const EMOJI_CATEGORIES = ['BanG Dream!', ...groups.map(group => group.name)];
export const EMOJI_OPTIONS: EmojiOption[] = [...groups.flatMap(group => group.items.map(([emoji, name]) => ({
  emoji, name, category: group.name, keywords: `${name} ${group.name} ${aliases[emoji] || ''}`,
}))), ...BANGDREAM_STICKERS];
const byEmoji = new Map(EMOJI_OPTIONS.map(option => [option.emoji, option]));
export const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const RECENT_KEY = 'tano-blog:recent-reactions:v1';
export const emojiName = (emoji: string) => byEmoji.get(emoji)?.name || emoji;
export const emojiOption = (emoji: string) => byEmoji.get(emoji);

export function emojiAsset(emoji: string): string | null {
  const option = byEmoji.get(emoji);
  if (!option) return null;
  if (option.asset) return option.asset;
  const codepoints = Array.from(emoji.replace(/\uFE0F/g, '')).map(character => character.codePointAt(0)!.toString(16)).join('-');
  return `/emoji/twemoji/${codepoints}.svg`;
}

export function recentEmojis(): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(saved) ? [...new Set(saved.filter((emoji): emoji is string => typeof emoji === 'string' && byEmoji.has(emoji)))].slice(0, 12) : [];
  } catch { return []; }
}

export function rememberEmoji(emoji: string) {
  if (!byEmoji.has(emoji)) return;
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify([emoji, ...recentEmojis().filter(value => value !== emoji)].slice(0, 12))); } catch { /* Storage restrictions must not block a reaction. */ }
}
