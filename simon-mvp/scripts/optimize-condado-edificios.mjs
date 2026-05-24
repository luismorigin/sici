import sharp from 'sharp'
import path from 'path'

const SRC = 'C:/Users/LUCHO/Downloads/Fotos edificios condado 1-5'
const OUT = path.resolve('public/condado-vi-v2')

// edificio -> archivos de origen (en orden)
const MAP = {
  'condado-1': ['IMG_0344.jpg', 'IMG_0346.jpg', 'IMG_0348.jpg'],
  'condado-2': ['IMG_0326-2.jpg', 'IMG_0329.jpg', 'IMG_0331-3.jpg'],
  'condado-3': ['IMG_0322.jpg', 'IMG_0323.jpg', 'IMG_0324.jpg'],
  'condado-4': ['IMG_0333.jpg', 'IMG_0334.jpg', 'IMG_0338.jpg'],
}

for (const [slug, files] of Object.entries(MAP)) {
  for (let i = 0; i < files.length; i++) {
    const inPath = path.join(SRC, files[i])
    const outName = `${slug}-${i + 1}.jpg`
    const outPath = path.join(OUT, outName)
    const info = await sharp(inPath)
      .rotate() // aplica orientación EXIF
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(outPath)
    const kb = (info.size / 1024).toFixed(0)
    console.log(`${files[i]} -> ${outName}  ${info.width}x${info.height}  ${kb} KB`)
  }
}
console.log('Done.')
