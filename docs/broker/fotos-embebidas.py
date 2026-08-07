"""Descarga las fotos de los avisos y las deja embebidas como data: URI.

Por qué: la plataforma donde se publica el prototipo bloquea todo host externo,
incluidas las imágenes. Un <img> a un CDN queda en blanco. Como las fotos se
muestran a 56x56 px, embeberlas a 112 px (2x para pantallas densas) pesa poco.

    python docs/broker/fotos-embebidas.py   # lee FOTOS_RAW del prototipo
"""
import base64, io, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

AQUI = Path(__file__).parent
LADO, CALIDAD = 112, 72
CDN = 'https://cdn.21online.lat/bolivia/cache/awsTest1/rc/'

def bajar(par):
    clave, url = par
    if url.startswith('~'):
        url = CDN + url[1:]
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=25) as r:
            im = Image.open(io.BytesIO(r.read())).convert('RGB')
        lado = min(im.size)                       # recorte cuadrado centrado, como el CSS
        im = im.crop(((im.width - lado) // 2, (im.height - lado) // 2,
                      (im.width + lado) // 2, (im.height + lado) // 2))
        im = im.resize((LADO, LADO), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=CALIDAD, optimize=True)
        return clave, 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        print(f'  ✗ {clave}: {type(e).__name__}', file=sys.stderr)
        return clave, None

def main():
    crudo = (Path(sys.argv[1] if len(sys.argv)>1 else AQUI/"fotos-avisos.txt")).read_text(encoding='utf-8')
    pares = [l.split('|', 1) for l in crudo.strip().split('\n') if '|' in l]
    print(f'{len(pares)} fotos a descargar…')
    with ThreadPoolExecutor(12) as ex:
        res = [r for r in ex.map(bajar, pares) if r[1]]
    salida = '\n'.join(f'{k}|{v}' for k, v in res)
    (Path(sys.argv[2] if len(sys.argv)>2 else AQUI/"fotos-embebidas.txt")).write_text(salida, encoding='utf-8')
    print(f'OK {len(res)}/{len(pares)} · {len(salida)/1024/1024:.2f} MB')

main()
