// Prints a cover's main colour as `{ tint }`, after drawing it as PNG at the densest screen's scale where asked, in a
// glow of that colour: `mini.png`, a small rounded square for the one-line player, and the card's cover with the mark
// under its bottom right corner as a signature under a print, as `card.png` while it plays and `card-dim.png` while
// it rests.
ObjC.import('AppKit')

function bitmap(width, height, scale) {
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, Math.round(width * scale), Math.round(height * scale), 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0)
  rep.setSize($.NSMakeSize(width, height))
  return rep
}

function within(rep, paint) {
  const context = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep)
  context.setImageInterpolation($.NSImageInterpolationHigh)
  $.NSGraphicsContext.saveGraphicsState
  $.NSGraphicsContext.setCurrentContext(context)
  paint()
  $.NSGraphicsContext.restoreGraphicsState
}

function isolated(paint) {
  $.NSGraphicsContext.saveGraphicsState
  paint()
  $.NSGraphicsContext.restoreGraphicsState
}

function save(rep, out) {
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(out, true)
}

// The cover shrunk to 16 × 16, its pixels as [r, g, b] rows.
function sample(image) {
  const rep = bitmap(16, 16, 1)
  within(rep, () =>
    image.drawInRectFromRectOperationFractionRespectFlippedHints(
      $.NSMakeRect(0, 0, 16, 16), $.NSZeroRect, $.NSCompositingOperationCopy, 1, true, $()))
  const rows = []
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const color = rep.colorAtXY(x, y)
      rows.push([color.redComponent, color.greenComponent, color.blueComponent].map(value => Math.round(value * 255)))
    }
  }
  return rows
}

// The densest screen's scale, so the picture stays sharp on whichever screen the terminal sits.
function density() {
  const screens = $.NSScreen.screens
  let scale = 1
  for (let i = 0; i < screens.count; i++) scale = Math.max(scale, screens.objectAtIndex(i).backingScaleFactor)
  return scale
}

const rounded = (rect, radius) => $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(rect, radius, radius)

function cover(image, rect, radius) {
  isolated(() => {
    rounded(rect, radius).addClip
    image.drawInRectFromRectOperationFractionRespectFlippedHints(rect, $.NSZeroRect, $.NSCompositingOperationSourceOver, 1, true, $())
  })
}

// A soft light of one colour around the cover's shape, reaching `reach` out and falling `drop` below it.
function glow(art, radius, [red, green, blue], strength, reach, drop) {
  isolated(() => {
    const shadow = $.NSShadow.alloc.init
    shadow.setShadowColor($.NSColor.colorWithSRGBRedGreenBlueAlpha(red / 255, green / 255, blue / 255, strength))
    shadow.setShadowBlurRadius(reach)
    shadow.setShadowOffset($.NSMakeSize(0, -drop))
    shadow.set
    $.NSColor.blackColor.set
    rounded(art, radius).fill
  })
}

function mini(image, folder, { width, height }) {
  const side = Math.round(height * 0.68)
  const rep = bitmap(width, height, density())
  within(rep, () => cover(image, $.NSMakeRect(0, (height - side) / 2, side, side), side * 0.16))
  save(rep, `${folder}/mini.png`)
}

// The cover centred in its glow, the mark beneath its bottom right corner; once bright, once dimmed.
function card(image, folder, { width, height, side, top, glow: spread, drop, color }, mark) {
  const art = $.NSMakeRect((width - side) / 2, height - top - side, side, side)
  const font = $.NSFont.systemFontOfSizeWeight(Math.max(7, side * 0.055), $.NSFontWeightMedium)
  const words = $.NSDictionary.dictionaryWithObjectsForKeys(
    $([font, $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.58, 0.57, 0.64, 0.8)]),
    $([$.NSFontAttributeName, $.NSForegroundColorAttributeName]))
  const signature = $(mark)
  const size = signature.sizeWithAttributes(words)
  for (const [name, strength] of [['card', 0.9], ['card-dim', 0.35]]) {
    const rep = bitmap(width, height, density())
    within(rep, () => {
      glow(art, side * 0.045, color, strength, 3 * spread * side, drop * side)
      cover(image, art, side * 0.045)
      signature.drawAtPointWithAttributes($.NSMakePoint(art.origin.x + side - size.width, art.origin.y - size.height * 1.45), words)
    })
    save(rep, `${folder}/${name}.png`)
  }
}

function oklab(rgb) {
  const [red, green, blue] = rgb.map(value =>
    value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4)
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

// sRGB at lightness `L` and hue `hue` (radians), with as much of `chroma` as sRGB can hold.
function srgb(L, chroma, hue) {
  const linear = c => {
    const [a, b] = [c * Math.cos(hue), c * Math.sin(hue)]
    const [l, m, s] = [
      L + 0.3963377774 * a + 0.2158037573 * b,
      L - 0.1055613458 * a - 0.0638541728 * b,
      L - 0.0894841775 * a - 1.291485548 * b,
    ].map(value => value ** 3)
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
  }
  let c = chroma
  while (c > 0.001 && !linear(c).every(value => value >= 0 && value <= 1)) c *= 0.94
  return linear(c).map(value => {
    const v = Math.min(1, Math.max(0, value))
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255)
  })
}

const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
const hueOf = color => ((Math.atan2(color.b, color.a) * 180) / Math.PI + 360) % 360
// How much a colour counts toward the cover's main one: its colourfulness, most at a middle lightness.
const weightOf = color => Math.hypot(color.a, color.b) * Math.max(0, 1 - Math.abs(color.L - 0.65) * 1.6)
// The glow of a colourless cover: its own white, a little cool.
const SILVER = [228, 228, 238]

// A cover's main colour: the hue its colourful pixels gather most around, at the average of the pixels near that
// hue, lifted to a lightness that reads on a dark terminal. The accent as hex, the glow as RGB; a colourless cover
// has no accent and glows silver.
function lookOf(pixels) {
  const colors = pixels.map(oklab)
  const bins = Array.from({ length: 24 }, () => 0)
  for (const color of colors) bins[Math.floor(hueOf(color) / 15)] += weightOf(color)
  if (bins.reduce((sum, weight) => sum + weight, 0) / pixels.length < 0.02) return { tint: null, glow: SILVER }
  const scores = bins.map((weight, i) => bins[(i + 23) % 24] + 2 * weight + bins[(i + 1) % 24])
  const center = scores.indexOf(Math.max(...scores)) * 15 + 7.5
  const near = colors.filter(color => hueGap(hueOf(color), center) <= 30)
  const total = near.reduce((sum, color) => sum + weightOf(color), 0)
  const [a, b] = ['a', 'b'].map(axis => near.reduce((sum, color) => sum + color[axis] * weightOf(color), 0) / total)
  const [hue, chroma] = [Math.atan2(b, a), Math.min(0.15, Math.max(0.07, Math.hypot(a, b) * 1.3))]
  return { tint: `#${srgb(0.74, chroma, hue).map(v => v.toString(16).padStart(2, '0')).join('')}`, glow: srgb(0.78, chroma, hue) }
}

function run([source, drawn]) {
  const image = $.NSImage.alloc.initWithContentsOfFile(source)
  const { tint, glow: color } = lookOf(sample(image))
  if (drawn !== undefined) {
    const { folder, mini: small, card: large, mark } = JSON.parse(drawn)
    mini(image, folder, small)
    card(image, folder, { ...large, color }, mark)
  }
  return JSON.stringify({ tint })
}
