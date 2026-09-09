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

for (const job of JOBS) {
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
