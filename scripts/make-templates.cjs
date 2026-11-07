// @ts-nocheck -- a one-off data builder, not part of the app
// Builds public/templates/*.json: the ready-made boards behind the template pages.
// Run: node scripts/make-templates.cjs
const fs = require('fs')
const OUT = require('path').join(__dirname, '../public/templates/')
function board(title, build) {
  let n = 0
  const els = []
  const id = () => 't' + (++n).toString(36).padStart(4, '0')
  const h = {
    sticky: (x, y, text, color = 'yellow', w = 200, fontSize = w < 180 ? 22 : 26) => els.push({ id: id(), type: 'sticky', color, x, y, w, h: w, text, fontSize }),
    text: (x, y, text, fontSize, color = 'ink') => els.push({ id: id(), type: 'text', color, x, y, text, fontSize }),
    box: (x, y, w, h2, color, text, fill = 'tint') => els.push({ id: id(), type: 'rect', color, x, y, w, h: h2, size: 'm', fill, text, fontSize: 30 }),
    photo: (x, y, w, h2, text = 'Drop a photo here') => els.push({ id: id(), type: 'rect', color: 'gray', x, y, w, h: h2, size: 's', fill: 'tint', text, fontSize: 22 }),
    swatches: (x, y, hexes) => hexes.forEach((hex, i) => els.push({ id: id(), type: 'swatch', color: 'ink', x: x + i * 136, y, w: 120, h: 150, hex })),
    arrow: (x1, y1, x2, y2) => els.push({ id: id(), type: 'arrow', color: 'gray', x1, y1, x2, y2, size: 'm' }),
    slide: (x, y, name) => els.push({ id: id(), type: 'slide', color: 'blue', x, y, w: 1280, h: 720, name, order: els.filter((e) => e.type === 'slide').length }),
  }
  build(h)
  return { title, elements: els }
}

const room = board('Room makeover', (b) => {
  // 1. the room today
  b.slide(0, 0, 'The room today')
  b.text(80, 80, 'Our room makeover', 88)
  b.text(84, 200, 'Where we are today', 32, 'gray')
  b.photo(80, 290, 560, 350, 'Drop a photo of the room as it is today')
  b.sticky(700, 290, 'What feels\nwrong?', 'yellow', 170)
  b.sticky(895, 290, 'What do\nwe love?', 'green', 170)
  b.sticky(1090, 290, 'Must\nkeep', 'blue', 170)
  b.text(700, 500, 'Paste photos straight onto the board,\nor drag them in from a website.', 24, 'gray')
  // 2. the mood
  b.slide(1480, 0, 'The mood')
  b.text(1560, 70, 'The mood', 64)
  b.photo(1560, 180, 330, 230, 'Inspiration')
  b.photo(1906, 180, 330, 230, 'Inspiration')
  b.photo(2252, 180, 330, 230, 'Inspiration')
  b.photo(1560, 430, 330, 230, 'Inspiration')
  b.swatches(1906, 450, ['#c56b3e', '#e9d8a6', '#8c6239', '#f4efe6'])
  b.sticky(2470, 440, 'Materials:\nlinen, oak,\nterracotta', 'yellow', 200)
  // 3. the plan
  b.slide(740, 900, 'The plan')
  b.text(820, 980, 'The plan', 64)
  b.text(824, 1070, 'One thing each weekend', 30, 'gray')
  b.box(820, 1180, 300, 160, 'orange', '1 · Lighting')
  b.box(1180, 1180, 300, 160, 'violet', '2 · Textiles')
  b.box(1540, 1180, 300, 160, 'green', '3 · Paint')
  b.arrow(1128, 1260, 1172, 1260)
  b.arrow(1488, 1260, 1532, 1260)
  b.sticky(820, 1400, 'Budget:\n€', 'gray', 170)
  b.sticky(1010, 1400, 'Done by:', 'red', 170)
  // the rest of the board
  b.sticky(2220, 1000, 'Ideas for\nlater', 'yellow', 200)
  b.sticky(2220, 1240, 'Tip: tap Present,\nthen Play, to walk\neveryone through it', 'blue', 260, 22)
})

const client = board('Client moodboard', (b) => {
  // 1. the brief
  b.slide(0, 0, 'The brief')
  b.text(80, 80, 'Project name', 88)
  b.text(84, 200, 'Moodboard · Client · Date', 32, 'gray')
  b.sticky(80, 320, 'Goal', 'yellow', 200)
  b.sticky(300, 320, 'Audience', 'green', 200)
  b.sticky(520, 320, 'Three words\nfor the feeling', 'blue', 200)
  b.photo(780, 100, 420, 540, 'Drop a reference image')
  // 2. mood
  b.slide(1480, 0, 'Mood')
  b.text(1560, 60, 'Mood', 64)
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) b.photo(1560 + c * 386, 170 + r * 266, 370, 250, 'Image')
  // 3. palette & type
  b.slide(0, 900, 'Palette & type')
  b.text(80, 980, 'Palette & type', 64)
  b.swatches(80, 1110, ['#0f172a', '#f97316', '#fde68a', '#e2e8f0', '#64748b'])
  b.text(80, 1310, 'Aa', 130)
  b.text(300, 1330, 'Headline font', 44)
  b.text(300, 1400, 'Body font: the quick brown fox\njumps over the lazy dog.', 26, 'gray')
  b.sticky(860, 1110, 'Why these?', 'yellow', 200)
  // 4. next steps
  b.slide(1480, 900, 'Next steps')
  b.text(1560, 980, 'Next steps', 64)
  b.box(1560, 1110, 320, 160, 'blue', 'Feedback by …')
  b.box(1930, 1110, 320, 160, 'violet', 'Round 2')
  b.box(2300, 1110, 320, 160, 'green', 'Final files')
  b.arrow(1888, 1190, 1922, 1190)
  b.arrow(2258, 1190, 2292, 1190)
  b.sticky(1560, 1330, 'Questions for\nthe client', 'yellow', 200)
})

fs.writeFileSync(OUT + 'room-makeover.json', JSON.stringify(room))
fs.writeFileSync(OUT + 'client-moodboard.json', JSON.stringify(client))
console.log('room', room.elements.length, 'client', client.elements.length)
