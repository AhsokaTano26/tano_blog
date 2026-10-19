// These short IDs are persisted by both reaction APIs. Never reuse or renumber them.
const bands = [
  { name: "Poppin'Party PPP ポピパ", members: [
    [1, '香澄·期待', '户山香澄 Kasumi Toyama'],
    [2, '多惠·震惊', '花园多惠 花园妙 花園たえ Tae Hanazono'],
    [3, '里美·害羞', '牛込里美 Rimi Ushigome'],
    [4, '沙绫·没问题', '山吹沙绫 Saaya Yamabuki'],
    [5, '有咲·汗', '市谷有咲 Arisa Ichigaya'],
  ] },
  { name: 'Afterglow AG', members: [
    [6, '兰·嫌弃', '美竹兰 Ran Mitake'],
    [7, '摩卡·满足', '青叶摩卡 Moca Aoba'],
    [8, '绯玛丽·宠溺', '上原绯玛丽 Himari Uehara'],
    [9, '巴·尴尬', '宇田川巴 Tomoe Udagawa'],
    [10, '鸫·讨厌', '羽泽鸫 Tsugumi Hazawa'],
  ] },
  { name: 'Hello Happy World HHW ハロハピ', members: [
    [11, '心·好耶', '弦卷心 Kokoro Tsurumaki'],
    [12, '薰·送花', '濑田薰 Kaoru Seta'],
    [13, '育美·高兴', '北泽育美 Hagumi Kitazawa'],
    [14, '花音·害怕', '松原花音 Kanon Matsubara'],
    [15, '米歇尔·DJ', '奥泽美咲 Misaki Okusawa Michelle'],
  ] },
  { name: 'Pastel Palettes パスパレ', members: [
    [16, '彩·躲藏', '丸山彩 Aya Maruyama'],
    [17, '日菜·挽留', '冰川日菜 Hina Hikawa'],
    [18, '千圣·暗中观察', '白鹭千圣 Chisato Shirasagi'],
    [19, '麻弥·紧张', '大和麻弥 Maya Yamato'],
    [20, '伊芙·比心', '若宫伊芙 Eve Wakamiya'],
  ] },
  { name: 'Roselia ロゼリア', members: [
    [21, '友希那·满足', '湊友希那 凑友希那 Yukina Minato'],
    [22, '纱夜·不高兴', '冰川纱夜 Sayo Hikawa'],
    [23, '莉莎·点赞', '今井莉莎 Lisa Imai'],
    [24, '亚子·打call', '宇田川亚子 Ako Udagawa'],
    [25, '燐子·懵', '白金燐子 Rinko Shirokane'],
  ] },
  { name: 'Morfonica モルフォニカ', members: [
    [26, '真白·惊慌', '仓田真白 Mashiro Kurata'],
    [27, '透子·心虚', '桐谷透子 Touko Kirigaya'],
    [28, '七深·安详', '广町七深 Nanami Hiromachi'],
    [29, '筑紫·不满', '二叶筑紫 Tsukushi Futaba'],
    [30, '瑠唯·优雅', '八潮瑠唯 Rui Yashio'],
  ] },
  { name: 'RAISE A SUILEN RAS', members: [
    [31, 'LAYER·拽', '和奏瑞依 Rei Wakana'],
    [32, 'LOCK·不可以', '朝日六花 Rokka Asahi'],
    [33, 'MASKING·来了', '佐藤益木 Masuki Sato'],
    [34, 'PAREO·太好了', '鳰原令王那 Reona Nyubara'],
    [35, 'CHU²·阴谋', '珠手知由 Chiyu Tamade CHU2'],
  ] },
  { name: 'MyGO!!!!! 迷子', members: [
    [36, '灯·放松', '高松灯 Tomori Takamatsu'],
    [37, '爱音·不解', '千早爱音 Anon Chihaya'],
    [38, '乐奈·困', '要乐奈 Raana Kaname'],
    [39, '爽世·微笑', '长崎爽世 Soyo Nagasaki'],
    [40, '立希·怒', '椎名立希 Taki Shiina'],
  ] },
] satisfies { name: string; members: [number, string, string][] }[];

export const BANGDREAM_STICKERS = bands.flatMap(band => band.members.map(([id, name, character]) => {
  const number = String(id).padStart(2, '0');
  return {
    emoji: `bd24:${number}`,
    name,
    category: 'BanG Dream!',
    keywords: `${name} ${character} ${band.name} BanG Dream! bangdream 邦邦 邦多利 bilibili B站 少女乐团派对`,
    asset: `/emoji/bangdream/bd24-${number}.webp`,
  };
}));
