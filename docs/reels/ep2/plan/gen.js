const { chromium } = require('playwright'); const fs = require('fs');
const box = (lines, top) => `<div class="w" style="top:${top}px">${lines.map(l => `<span class="b">${l}</span>`).join('<br>')}</div>`;
const caps = {
  c1: box(['운동 안 하고 릴스 보는 법 찾음 🤫'], 230),
  c2: box(['비상 5분 있잖아 ㅋ'], 230),
  c3: box(['5분이면 충분하지 😎'], 230),
  c4: box(['어…? 버튼 어디 감'], 230),
  c5: box(['비상 5분… 하루 한 번이었음'], 230),
  c6: box(['결국 하러 감 ㅋㅋ'], 230),
  ring: `<div style="position:absolute;left:350px;top:1700px;width:380px;height:110px;border-radius:55px;border:9px solid #E0454A;background:rgba(224,69,74,.12)"></div>`,
};
const times = ['5:00','4:12','3:21','2:30','1:42','0:58','0:21','0:05','0:03','0:02','0:01','0:00'];
times.forEach((t, i) => caps['t' + String(i).padStart(2, '0')] =
  `<div style="position:absolute;left:50%;top:1500px;transform:translateX(-50%);background:rgba(0,0,0,.66);border-radius:999px;padding:22px 52px;white-space:nowrap;color:#fff;font:700 50px Pretendard">비상 해제 · <span style="color:${i>=8?'#FF6B6F':'#fff'};font-weight:900;font-variant-numeric:tabular-nums">${t}</span> 남음</div>`);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
for (const [k,v] of Object.entries(caps)){
 fs.writeFileSync(`ep2/tmp_${k}.html`, `<html><head><meta charset="utf-8"><style>*{margin:0}body{width:1080px;height:1920px;background:transparent;position:relative;font-family:Pretendard}
 .w{position:absolute;left:0;right:0;text-align:center;line-height:1.55}
 .b{display:inline-block;background:rgba(0,0,0,.62);color:#fff;font-weight:800;font-size:58px;letter-spacing:-1.5px;padding:10px 30px;border-radius:22px;margin:4px 0}</style></head><body>${v}</body></html>`);
 await p.goto(`file://${process.cwd()}/ep2/tmp_${k}.html`); await p.waitForTimeout(150);
 await p.screenshot({path:`ep2/o_${k}.png`, omitBackground:true});}
await b.close();})();
