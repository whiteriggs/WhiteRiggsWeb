"""Genera los iconos WebP de la portada a partir de los PNG de 1024 px.

Uso: python3 scripts/home_icons.py
"""
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'assets'
DESTINO = ORIGEN / 'home'

APPS = ['curiosity', 'futline', 'getmeout', 'escalofrio', 'wyrms']
TAMANOS_APP = (1024, 512, 256)


def exportar(origen, nombre, lados):
    imagen = Image.open(origen).convert('RGBA')
    for lado in lados:
        salida = DESTINO / f'{nombre}-{lado}.webp'
        copia = imagen if imagen.width == lado else imagen.resize((lado, lado), Image.LANCZOS)
        copia.save(salida, 'WEBP', quality=82, method=6)
        print(f'{salida.relative_to(RAIZ)}  {salida.stat().st_size // 1024} KB')


def main():
    DESTINO.mkdir(exist_ok=True)
    for app in APPS:
        exportar(ORIGEN / f'{app}-icon.png', app, TAMANOS_APP)
    exportar(ORIGEN / 'riggs-logo.png', 'riggs', (256,))


if __name__ == '__main__':
    main()
