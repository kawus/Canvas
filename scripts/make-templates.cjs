// @ts-nocheck -- a one-off data builder, not part of the app
// Builds public/templates/*.json: the ready-made boards behind the template pages.
// Run: node scripts/make-templates.cjs
//
// Every template speaks the same creative language (see docs/templates.md):
//  1. an opening slide: a big title, a "Kind · Who · Date" line, three question stickies
//     (yellow, green, blue), one photo spot and a line on adding photos
//  2. the mood: a grid of image spots
//  3. the details: palette and type, materials or sketches, with a "Why these?" sticky
//  4. the plan: three numbered steps (blue, violet, green) joined by arrows, and a question sticky
//  and, beside the slides, the same two stickies: a tip on presenting and "Ideas for later".
const fs = require('fs')
const OUT = require('path').join(__dirname, '../public/templates/')

const COL = 1480 // slides sit in two columns, 200 apart
const ROW = 900

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

    /* ---------- the shared language ---------- */

    /** 1. the opening slide */
    opening: (x, y, { name, title, kind, prompts, photo }) => {
      h.slide(x, y, name)
      h.text(x + 80, y + 80, title, 88)
      h.text(x + 84, y + 200, kind, 32, 'gray')
      prompts.forEach((p, i) => h.sticky(x + 80 + i * 220, y + 320, p, ['yellow', 'green', 'blue'][i], 200))
      h.text(x + 80, y + 560, 'Paste photos straight onto the board,\nor drag them in from a website.', 24, 'gray')
      h.photo(x + 780, y + 100, 420, 540, photo)
    },
    /** a section title (and an optional line under it) */
    heading: (x, y, title, line) => {
      h.text(x + 80, y + 60, title, 64)
      if (line) h.text(x + 84, y + 150, line, 30, 'gray')
    },
    /** 2. the mood: a 3 × 2 grid of image spots */
    mood: (x, y, labels) => {
      h.slide(x, y, 'Mood')
      h.heading(x, y, 'Mood')
      labels.forEach((label, i) => h.photo(x + 80 + (i % 3) * 386, y + 170 + Math.floor(i / 3) * 266, 370, 250, label))
    },
    /** 3. palette and type */
    paletteType: (x, y, hexes) => {
      h.slide(x, y, 'Palette & type')
      h.heading(x, y, 'Palette & type')
      h.swatches(x + 80, y + 190, hexes)
      h.text(x + 80, y + 390, 'Aa', 130)
      h.text(x + 300, y + 410, 'Headline font', 44)
      h.text(x + 300, y + 480, 'Body font: the quick brown fox\njumps over the lazy dog.', 26, 'gray')
      h.sticky(x + 860, y + 190, 'Why these?', 'yellow', 200)
    },
    /** 4. the plan: three numbered steps and a question */
    plan: (x, y, { name, line, steps, question }) => {
      h.slide(x, y, name)
      h.heading(x, y, name, line)
      const top = y + (line ? 230 : 190)
      steps.forEach((s, i) => h.box(x + 80 + i * 370, top, 320, 160, ['blue', 'violet', 'green'][i], `${i + 1} · ${s}`))
      h.arrow(x + 408, top + 80, x + 442, top + 80)
      h.arrow(x + 778, top + 80, x + 812, top + 80)
      h.sticky(x + 80, top + 220, question, 'yellow', 200)
    },
    /** beside the slides: the same two stickies on every board */
    extras: (x, y) => {
      h.sticky(x, y, 'Ideas for\nlater', 'yellow', 200)
      h.sticky(x, y + 240, 'Tip: tap Present,\nthen Play, to walk\neveryone through it', 'blue', 260, 22)
    },
  }
  build(h)
  return { title, elements: els }
}

const room = board('Room makeover', (b) => {
  b.opening(0, 0, {
    name: 'The room today',
    title: 'Our new room',
    kind: 'Room makeover · Which room · Date',
    prompts: ['What feels\nwrong?', 'What do\nwe love?', 'Must\nkeep'],
    photo: 'Drop a photo of the room as it is today',
  })
  // the mood, with the materials beside it
  b.slide(COL, 0, 'The mood')
  b.heading(COL, 0, 'The mood')
  b.photo(COL + 80, 170, 330, 230, 'Inspiration')
  b.photo(COL + 426, 170, 330, 230, 'Inspiration')
  b.photo(COL + 772, 170, 330, 230, 'Inspiration')
  b.photo(COL + 80, 420, 330, 230, 'Inspiration')
  b.swatches(COL + 426, 440, ['#c56b3e', '#e9d8a6', '#8c6239', '#f4efe6'])
  b.sticky(COL + 990, 430, 'Materials:\nlinen, oak,\nterracotta', 'yellow', 200)
  b.plan(740, ROW, { name: 'The plan', line: 'One thing each weekend', steps: ['Lighting', 'Textiles', 'Paint'], question: 'Budget:\n€' })
  b.extras(2220, ROW + 100)
})

const client = board('Client moodboard', (b) => {
  b.opening(0, 0, {
    name: 'The brief',
    title: 'Project name',
    kind: 'Moodboard · Client · Date',
    prompts: ['Goal', 'Audience', 'Three words\nfor the feeling'],
    photo: 'Drop a reference image',
  })
  b.mood(COL, 0, ['Image', 'Image', 'Image', 'Image', 'Image', 'Image'])
  b.paletteType(0, ROW, ['#0f172a', '#f97316', '#fde68a', '#e2e8f0', '#64748b'])
  b.plan(COL, ROW, { name: 'Next steps', steps: ['Feedback by …', 'Round 2', 'Final files'], question: 'Questions for\nthe client' })
  b.extras(2960, 0)
})

const brand = board('Brand identity', (b) => {
  b.opening(0, 0, {
    name: 'The brand',
    title: 'Brand name',
    kind: 'Brand identity · Team · Date',
    prompts: ['What we\nstand for', 'Who it’s for', 'Three words\nfor the brand'],
    photo: 'Drop the current logo, or a photo that feels like the brand',
  })
  b.mood(COL, 0, ['Photography', 'Texture', 'Shapes', 'Places', 'Details', 'Feeling'])
  // logo directions: room to sketch with the pen or Apple Pencil
  b.slide(0, ROW, 'Logo')
  b.heading(0, ROW, 'Logo', 'Sketch directions with the pen or Apple Pencil')
  ;['Direction A', 'Direction B', 'Direction C'].forEach((d, i) => b.photo(80 + i * 386, ROW + 230, 370, 280, d))
  b.sticky(80, ROW + 530, 'What should\nthe mark say?', 'yellow', 170)
  b.paletteType(COL, ROW, ['#1f2a44', '#e76f51', '#f4a261', '#f1ece2', '#8ab17d'])
  b.plan(740, 2 * ROW, { name: 'Next steps', steps: ['Directions', 'Feedback', 'Final identity'], question: 'Questions for\nthe team' })
  b.extras(2960, 0)
})

fs.writeFileSync(OUT + 'room-makeover.json', JSON.stringify(room))
fs.writeFileSync(OUT + 'client-moodboard.json', JSON.stringify(client))
fs.writeFileSync(OUT + 'brand-identity.json', JSON.stringify(brand))
console.log('room', room.elements.length, 'client', client.elements.length, 'brand', brand.elements.length)
