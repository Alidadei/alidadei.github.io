// 一次性维护脚本:对 AwardWall 展示的证书照片中的姓名/学号/证件号做像素化打码。
// 坐标为各图当前分辨率的绝对像素 [left, top, width, height],原图尺寸不会变,可重复执行。
// 注意:git 历史中仍保留未打码原图;彻底移除需重写历史(已与站长确认暂不做)。
import sharp from 'sharp';
import fs from 'node:fs';

const JOBS = [
  {
    file: 'public/images/相辉奖状.jpg',
    boxes: [
      [150, 465, 215, 80],   // 姓名「余泓麟 同学」
      [130, 830, 445, 68],   // 学号行
    ],
  },
  {
    file: 'public/images/第五届海工.jpg',
    boxes: [
      [60, 435, 480, 130],   // 手写三位队员姓名
    ],
  },
  {
    file: 'public/images/第四届国际海洋工程准备科技创新大赛.jpg',
    boxes: [
      [375, 650, 535, 65],   // 作品成员行(四人姓名)
      [375, 735, 325, 60],   // 指导老师行
    ],
  },
  {
    file: 'public/images/华为HSD证书.jpg',
    boxes: [
      [680, 335, 240, 95],   // 姓名
    ],
  },
  // 实习证明-华为.png:裁切部分不含姓名,无需处理
  {
    file: 'public/images/二等奖学金.jpg',
    boxes: [
      [80, 390, 210, 65],    // 中文姓名行
      [680, 498, 140, 60],   // 英文行「YU Honglin」
    ],
  },
  {
    file: 'public/images/优秀学生.jpg',
    boxes: [
      [80, 385, 200, 60],    // 中文姓名行
      [630, 478, 145, 54],   // 英文行「YU Honglin」
    ],
  },
  {
    file: 'public/images/第十四届蓝桥杯电子赛省奖.jpg',
    boxes: [
      [140, 425, 320, 70],   // 姓名行「中国海洋大学余泓麟」
      [190, 780, 450, 70],   // 证件号码行(身份证号,最敏感)
    ],
  },
];

// 第二轮(2026-09-09):第一轮只处理了 AwardWall 前 8 张(grep head -8 截断漏了 5 张),补齐
// 其余引用中的证书与孤儿证书图。运行:node scripts/redact-certificate-images.mjs round2
const ROUND2 = [
  {
    file: 'public/images/三年成绩不断进步.jpg',
    boxes: [
      [55, 88, 350, 130],    // 学号/姓名/班级 三列(成绩系统截图)
    ],
  },
  {
    file: 'public/images/山东省机器人大赛三等奖.jpg',
    boxes: [
      [265, 455, 675, 55],   // 参赛人员五人姓名
      [392, 542, 70, 48],    // 指导老师姓名
    ],
  },
  {
    file: 'public/images/美赛S奖2428151.jpg',
    boxes: [
      [580, 275, 200, 80],   // 队员两行姓名(Hongxin Zhang / Honglin Yu)
      [600, 425, 115, 48],   // Faculty Advisor
    ],
  },
  {
    file: 'public/images/2023全国大学生商务英语竟赛二等奖.jpg',
    boxes: [
      [360, 575, 190, 65],   // 姓名
    ],
  },
  {
    file: 'public/images/全国英语阅读比赛一等奖.png',
    boxes: [
      [570, 408, 140, 52],   // 姓名
    ],
  },
  {
    file: 'public/images/人工智能知识竞赛.jpg',
    boxes: [
      [545, 492, 190, 70],   // 姓名
    ],
  },
  {
    file: 'public/images/三等奖学金.jpg',
    boxes: [
      [78, 432, 105, 55],    // 中文姓名
      [648, 568, 170, 52],   // 英文行 YU Honglin
    ],
  },
  {
    file: 'public/images/srdp.jpg',
    boxes: [
      [348, 592, 70, 48],    // 项目负责人姓名
      [338, 642, 220, 48],   // 项目组成员姓名
      [338, 690, 60, 45],    // 指导教师姓名
    ],
  },
];

// 第三轮(2026-09-09):第二轮按网格探针实测坐标修正残留(名字尾巴/偏移)
const ROUND3 = [
  {
    file: 'public/images/2023全国大学生商务英语竟赛二等奖.jpg',
    boxes: [[340, 532, 215, 62]],          // 姓名余泓麟(上轮框偏低 30px)
  },
  {
    file: 'public/images/三等奖学金.jpg',
    boxes: [[635, 565, 180, 50]],          // 英文行 YU Honglin
  },
  {
    file: 'public/images/人工智能知识竞赛.jpg',
    boxes: [[555, 462, 190, 62]],          // 姓名余泓麟
  },
  {
    file: 'public/images/美赛S奖2428151.jpg',
    boxes: [
      [560, 268, 240, 92],                 // 队员两行(右端 g 尾巴残留)
      [670, 428, 130, 48],                 // Faculty Advisor(右端 an 残留)
    ],
  },
  {
    file: 'public/images/山东省机器人大赛三等奖.jpg',
    boxes: [[378, 530, 75, 48]],           // 指导老师姓名残留
  },
  {
    file: 'public/images/三年成绩不断进步.jpg',
    boxes: [[335, 68, 125, 140]],          // 班级列「类4班」残留
  },
];

// 第四轮(2026-09-09):对剩余区域改用整行带覆盖(范围取自网格探针实测,留足余量,宁多盖不漏盖)
const ROUND4 = [
  {
    file: 'public/images/2023全国大学生商务英语竟赛二等奖.jpg',
    boxes: [[70, 528, 780, 140]],          // 姓名行 + 英文两行整带(校名 485-515 与中文祝贺行 680+ 均在带外)
  },
  {
    file: 'public/images/三等奖学金.jpg',
    boxes: [[85, 528, 760, 100]],          // 英文两行整带(YU Honglin 所在)
  },
  {
    file: 'public/images/人工智能知识竞赛.jpg',
    boxes: [[480, 458, 340, 72]],          // 姓名行整带(校名 425-455 在带外)
  },
  {
    file: 'public/images/美赛S奖2428151.jpg',
    boxes: [
      [480, 262, 330, 105],                // 队员姓名两行整带
      [560, 420, 290, 62],                 // Faculty Advisor 姓名行整带(标签行 390-415 在带外)
    ],
  },
  {
    file: 'public/images/山东省机器人大赛三等奖.jpg',
    boxes: [[265, 522, 200, 70]],          // 指导老师整行(含标签)
  },
  {
    file: 'public/images/三年成绩不断进步.jpg',
    boxes: [[330, 60, 140, 155]],          // 班级列全部(「类4班」残留)
  },
];

const JOBS_ALL = process.argv[2] === 'round2' ? ROUND2 : process.argv[2] === 'round3' ? ROUND3 : process.argv[2] === 'round4' ? ROUND4 : JOBS;

for (const job of JOBS_ALL) {
  const composites = [];
  for (const [left, top, width, height] of job.boxes) {
    const small = await sharp(job.file)
      .extract({ left, top, width, height })
      .resize(Math.max(1, Math.round(width / 16)), Math.max(1, Math.round(height / 16)), { fit: 'fill' })
      .toBuffer();
    const mosaic = await sharp(small).resize(width, height, { fit: 'fill' }).blur(2).toBuffer();
    composites.push({ input: mosaic, left, top });
  }
  const out = job.file.endsWith('.png')
    ? sharp(job.file).composite(composites).png()
    : sharp(job.file).composite(composites).jpeg({ quality: 88 });
  const buf = await out.toBuffer();
  const tmp = job.file + '.tmp';
  fs.writeFileSync(tmp, buf);
  for (let i = 0; i < 6; i++) {
    try {
      fs.renameSync(tmp, job.file);
      break;
    } catch (e) {
      if (i === 5) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log('done:', job.file, `(${job.boxes.length} 处打码)`);
}
