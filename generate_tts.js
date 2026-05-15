/**
 * Node.js 版唐诗语音生成脚本
 * 使用 msedge-tts 调用微软 Edge 免费 TTS
 * 安装: npm install msedge-tts
 */
const fs = require('fs');
const path = require('path');
const { MsEdgeTTS } = require('msedge-tts');

const OUTPUT_DIR = 'tang_audio';

// 唐诗数据
const TANG_POETRY = [
  {
    id: 'libai',
    name: '李白',
    poems: [
      { title: '静夜思', content: '床前明月光，疑是地上霜。举头望明月，低头思故乡。' },
      { title: '望庐山瀑布', content: '日照香炉生紫烟，遥看瀑布挂前川。飞流直下三千尺，疑是银河落九天。' },
      { title: '赠汪伦', content: '李白乘舟将欲行，忽闻岸上踏歌声。桃花潭水深千尺，不及汪伦送我情。' },
      { title: '早发白帝城', content: '朝辞白帝彩云间，千里江陵一日还。两岸猿声啼不住，轻舟已过万重山。' },
      { title: '黄鹤楼送孟浩然之广陵', content: '故人西辞黄鹤楼，烟花三月下扬州。孤帆远影碧空尽，唯见长江天际流。' },
      { title: '月下独酌', content: '花间一壶酒，独酌无相亲。举杯邀明月，对影成三人。' },
      { title: '行路难', content: '金樽清酒斗十千，玉盘珍羞直万钱。停杯投箸不能食，拔剑四顾心茫然。' },
      { title: '将进酒', content: '君不见黄河之水天上来，奔流到海不复回。君不见高堂明镜悲白发，朝如青丝暮成雪。' },
      { title: '夜宿山寺', content: '危楼高百尺，手可摘星辰。不敢高声语，恐惊天上人。' },
      { title: '独坐敬亭山', content: '众鸟高飞尽，孤云独去闲。相看两不厌，只有敬亭山。' },
      { title: '秋浦歌十七首·其十五', content: '白发三千丈，缘愁似个长。不知明镜里，何处得秋霜。' },
      { title: '古朗月行', content: '小时不识月，呼作白玉盘。又疑瑶台镜，飞在青云端。' },
      { title: '春夜洛城闻笛', content: '谁家玉笛暗飞声，散入春风满洛城。此夜曲中闻折柳，何人不起故园情。' },
      { title: '望天门山', content: '天门中断楚江开，碧水东流至此回。两岸青山相对出，孤帆一片日边来。' },
      { title: '闻王昌龄左迁龙标遥有此寄', content: '杨花落尽子规啼，闻道龙标过五溪。我寄愁心与明月，随君直到夜郎西。' },
      { title: '峨眉山月歌', content: '峨眉山月半轮秋，影入平羌江水流。夜发清溪向三峡，思君不见下渝州。' },
      { title: '渡荆门送别', content: '渡远荆门外，来从楚国游。山随平野尽，江入大荒流。' },
      { title: '送友人', content: '青山横北郭，白水绕东城。此地一为别，孤蓬万里征。' },
      { title: '宣州谢朓楼饯别校书叔云', content: '弃我去者，昨日之日不可留；乱我心者，今日之日多烦忧。' },
      { title: '长相思', content: '长相思，在长安。络纬秋啼金井阑，微霜凄凄簟色寒。' },
    ]
  },
  // ... 其余诗人数据省略，实际需要时可补充完整
];

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata('zh-CN-XiaoxiaoNeural', MsEdgeTTS.OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);

  let count = 0;
  for (const poet of TANG_POETRY) {
    for (let i = 0; i < poet.poems.length; i++) {
      const poem = poet.poems[i];
      const readText = `${poem.title}。${poet.name}。${poem.content}`;
      const safeTitle = poem.title.replace(/[^\w一-鿿]/g, '_');
      const filename = `${poet.id}_${String(i).padStart(2, '0')}_${safeTitle}.mp3`;
      const filepath = path.join(OUTPUT_DIR, filename);

      if (fs.existsSync(filepath)) {
        console.log(`[跳过] ${filename}`);
        continue;
      }

      console.log(`[生成] ${poet.name} - ${poem.title}`);
      try {
        const { audioFilePath } = await tts.toFile(filepath, readText);
        console.log(`  ✓ ${audioFilePath}`);
        count++;
      } catch (e) {
        console.log(`  ✗ ${poet.name} - ${poem.title}: ${e.message}`);
      }
    }
  }

  console.log(`\n完成！生成 ${count} 首，保存在 ./${OUTPUT_DIR}/`);
}

main().catch(console.error);
