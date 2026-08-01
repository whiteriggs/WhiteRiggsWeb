#!/usr/bin/env python3
"""Genera la tabla de precios de vivienda que consume la app LYVARA.

Fuente: "Valor tasado medio de vivienda libre" del Ministerio de Vivienda y
Agenda Urbana (tasaciones bajo la Orden ECO/805/2003), publicado por trimestres
en el Boletín Estadístico Online. Son .xls de BIFF8 de varios MB: se convierten
aquí a un JSON pequeño en vez de descargarlos y parsearlos en el móvil.

Lo lanza cada mes .github/workflows/house-prices.yml y publica el resultado en
data/lyvara/. Ejecutado en local actualiza además la copia empaquetada en el
repo de la app, si está al lado.

Uso:  pip install xlrd && python3 scripts/build_house_prices.py
"""

import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

import xlrd

BASE = "https://apps.fomento.gob.es/BoletinOnline2/sedal"
PROVINCES_XLS = f"{BASE}/35101000.XLS"      # Tabla 1: por provincias
MUNICIPALITIES_XLS = f"{BASE}/35103500.XLS"  # Tabla 4: municipios > 25.000 hab
REPO = Path(__file__).resolve().parent.parent
OUTPUT = REPO / "data/lyvara/house_prices.json"
# Copia empaquetada con la app, para que estimar no dependa de la red.
APP_OUTPUT = REPO.parent / "LYVARA/Packages/LyvaraKit/Sources/Data/Resources/house_prices.json"

ARTICLES = {"el", "la", "los", "las", "l", "els", "les", "o", "a", "os", "as"}

# Erratas del origen: el ministerio parte "Santa Cruz de Tenerife" en dos filas
# y escribe mal Valladolid. Se corrigen por clave normalizada.
PROVINCE_FIXES = {
    "santa cruz de": "Santa Cruz de Tenerife",
    "tenerife": "Santa Cruz de Tenerife",
    "valladodid": "Valladolid",
    "la coruna": "Coruña (A)",
}

# El ministerio usa el nombre oficial y el usuario suele escribir el castellano.
EXTRA_ALIASES = {
    "a coruna": ["la coruna"],
    "balears illes": ["baleares", "islas baleares"],
    "araba alava": ["alava"],
    "bizkaia": ["vizcaya"],
    "gipuzkoa": ["guipuzcoa"],
    "girona": ["gerona"],
    "lleida": ["lerida"],
    "ourense": ["orense"],
}


def indexed(rows: list[tuple[str, dict]], prefix: str = "") -> dict:
    """Indexa por nombre exacto primero: un alias nunca tapa a un nombre real."""
    table = {}
    for name, entry in rows:
        table[prefix + normalize(name)] = entry
    for name, entry in rows:
        for key in aliases(name):
            table.setdefault(prefix + key, entry)
    return table


def normalize(name: str) -> str:
    """Clave de búsqueda. Debe coincidir con `normalized(_:)` en Swift."""
    text = unicodedata.normalize("NFD", name.strip().lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9ñ]+", " ", text).strip()
    parts = text.split()
    # El ministerio escribe "Ejido (El)" y el usuario "El Ejido".
    if len(parts) > 1 and parts[-1] in ARTICLES:
        parts = [parts[-1]] + parts[:-1]
    return " ".join(parts)


def aliases(name: str) -> list[str]:
    """Formas con las que el usuario puede escribir un nombre oficial.

    "Madrid (Comunidad de)" solo se encuentra si también responde a "Madrid",
    y "Valencia/València" a cada una de sus dos mitades.
    """
    found = []
    variants = [name]
    match = re.match(r"^(.*?)\s*\((.+?)\)\s*$", name)
    if match:
        base, inside = match.group(1), match.group(2).strip()
        variants.append(base)
        if normalize(inside) not in ARTICLES:
            variants.append(f"{inside} {base}")
    for variant in list(variants):
        if "/" in variant:
            variants.extend(variant.split("/"))
    for variant in variants:
        key = normalize(variant)
        if key and key not in found:
            found.append(key)
    for key in list(found):
        found.extend(a for a in EXTRA_ALIASES.get(key, []) if a not in found)
    return found


def fetch(url: str, name: str) -> xlrd.Book:
    print(f"descargando {name}…")
    with urllib.request.urlopen(url, timeout=120) as response:
        return xlrd.open_workbook(file_contents=response.read())


def parse_provinces(book: xlrd.Book) -> dict:
    sheet = book.sheet_by_name(book.sheet_names()[-1])
    quarters = sheet.row_values(13)
    national = sheet.row_values(14)
    # La última columna es "Variación Anual", no un precio: solo valen las
    # columnas cuya cabecera es un trimestre y tienen dato.
    columns = [
        c for c in range(sheet.ncols)
        if re.match(r"^[1-4]º", str(quarters[c]).strip()) and isinstance(national[c], float)
    ]
    if not columns:
        sys.exit("No se encontró ninguna columna de trimestre en la tabla provincial.")
    column = columns[-1]

    rows = []
    for row in range(15, sheet.nrows):
        values = sheet.row_values(row)
        name = str(values[1]).strip()
        price = values[column]
        if name and isinstance(price, float) and price > 0:
            rows.append((name, {"name": name, "total": round(price)}))
    return indexed(rows)


def parse_municipalities(book: xlrd.Book) -> tuple[dict, str]:
    name = book.sheet_names()[-1].strip()
    match = re.match(r"^T(\d)A(\d{4})$", name)
    if not match:
        sys.exit(f"Nombre de hoja inesperado: {name!r}")
    period = f"{match.group(2)}-Q{match.group(1)}"

    sheet = book.sheet_by_name(book.sheet_names()[-1])
    prices, province = {}, ""
    for row in range(17, sheet.nrows):
        values = sheet.row_values(row)
        if str(values[1]).strip():
            raw = str(values[1]).strip()
            province = PROVINCE_FIXES.get(normalize(raw), raw)
        municipality = str(values[2]).strip()
        total = values[5]
        if not municipality or not province or not isinstance(total, float) or total <= 0:
            continue
        entry = {"name": municipality, "total": round(total)}
        # "n.r" (no representativo) llega como texto: se omite ese tramo.
        if isinstance(values[3], float) and values[3] > 0:
            entry["new"] = round(values[3])
        if isinstance(values[4], float) and values[4] > 0:
            entry["old"] = round(values[4])
        for key in aliases(province):
            prices.update(indexed([(municipality, entry)], prefix=f"{key}|"))
    return prices, period


def main() -> None:
    municipalities, period = parse_municipalities(fetch(MUNICIPALITIES_XLS, "municipios"))
    provinces = parse_provinces(fetch(PROVINCES_XLS, "provincias"))
    if not municipalities or not provinces:
        sys.exit("Las tablas llegaron vacías: revisa si cambió el formato.")

    # Las dos tablas nombran las provincias distinto: si una no cuadra, el
    # respaldo provincial de sus municipios no existiría y nadie se enteraría.
    orphans = sorted({k.split("|")[0] for k in municipalities} - set(provinces))
    if orphans:
        sys.exit("Provincias de la tabla municipal sin equivalente provincial: " + ", ".join(orphans))

    payload = {
        "period": period,
        "source": "Valor tasado medio de vivienda libre, Ministerio de Vivienda y Agenda Urbana",
        "provinces": provinces,
        "municipalities": municipalities,
    }
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=1)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(text, encoding="utf-8")
    print(f"{period}: {len(municipalities)} municipios, {len(provinces)} provincias y comunidades")
    print(f"escrito {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")

    if APP_OUTPUT.parent.is_dir():
        APP_OUTPUT.write_text(text, encoding="utf-8")
        print(f"escrito {APP_OUTPUT}")
    else:
        print("aviso: el repo de la app no está al lado, no se toca la copia empaquetada")


if __name__ == "__main__":
    main()
