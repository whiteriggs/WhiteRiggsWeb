#!/usr/bin/env python3
"""Descargas por app desde la API de App Store Connect.

    ASC_KEY=~/Downloads/AuthKey_XXX.p8 ASC_KEY_ID=XXX ASC_ISSUER=uuid \
    ASC_VENDOR=1234567 python3 descargas.py [dias | mesN] [--json ruta]

El argumento es un numero de dias (7, 30) o "mes" para los ultimos doce meses,
"mes24" para veinticuatro. Con --json escribe el recuento por bundle id en vez
de imprimir la tabla. Sin ASC_VENDOR solo comprueba la clave y lista apps.

El ASC_VENDOR sale de App Store Connect, en Pagos e informes financieros; no hay
endpoint que lo devuelva.
"""

import base64
import collections
import csv
import datetime
import gzip
import io
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

BASE = "https://api.appstoreconnect.apple.com"


def ajuste(nombre, obligatorio=True):
    valor = os.environ.get(nombre)
    if not valor and obligatorio:
        sys.exit(f"falta {nombre}. Mira la cabecera de este fichero.")
    return valor


CLAVE = pathlib.Path(os.path.expanduser(ajuste("ASC_KEY")))
KEY_ID = ajuste("ASC_KEY_ID")
ISSUER = ajuste("ASC_ISSUER")
VENDOR = ajuste("ASC_VENDOR", obligatorio=False)


def b64(crudo):
    return base64.urlsafe_b64encode(crudo).rstrip(b"=")


def credencial():
    ahora = int(time.time())
    cabecera = {"alg": "ES256", "kid": KEY_ID, "typ": "JWT"}
    cuerpo = {"iss": ISSUER, "iat": ahora, "exp": ahora + 900, "aud": "appstoreconnect-v1"}
    firmado = b64(json.dumps(cabecera).encode()) + b"." + b64(json.dumps(cuerpo).encode())

    llave = serialization.load_pem_private_key(CLAVE.read_bytes(), password=None)
    der = llave.sign(firmado, ec.ECDSA(hashes.SHA256()))
    # El JWT quiere r|s en crudo, no el DER que devuelve cryptography.
    r, s = utils.decode_dss_signature(der)
    return (firmado + b"." + b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))).decode()


def pedir(ruta, acepta="application/json"):
    peticion = urllib.request.Request(BASE + ruta)
    peticion.add_header("Authorization", "Bearer " + credencial())
    peticion.add_header("Accept", acepta)
    try:
        with urllib.request.urlopen(peticion) as respuesta:
            return respuesta.read(), None
    except urllib.error.HTTPError as fallo:
        return None, (fallo.code, fallo.read().decode(errors="replace"))


def apps():
    crudo, error = pedir("/v1/apps?limit=200&fields[apps]=name,sku,bundleId")
    if error:
        print(f"no autentica: HTTP {error[0]}\n{error[1][:400]}")
        sys.exit(1)
    return {
        a["attributes"]["sku"]: (a["attributes"]["name"], a["attributes"]["bundleId"])
        for a in json.loads(crudo)["data"]
    }


def informe(periodo, frecuencia="DAILY"):
    ruta = (
        "/v1/salesReports?filter[frequency]=" + frecuencia + "&filter[reportType]=SALES"
        "&filter[reportSubType]=SUMMARY&filter[vendorNumber]=" + VENDOR
        + "&filter[reportDate]=" + periodo
    )
    crudo, error = pedir(ruta, acepta="application/a-gzip")
    if error:
        # 404 es un periodo sin ventas y 410 uno anterior a lo que Apple guarda.
        if error[0] not in (404, 410):
            print(f"{periodo}: HTTP {error[0]} {error[1][:300]}")
        return []
    texto = gzip.decompress(crudo).decode("utf-8")
    return list(csv.DictReader(io.StringIO(texto), delimiter="\t"))


def periodos(argumento):
    """Devuelve (rotulo, lista de (fecha, frecuencia)) a partir del argumento."""
    hoy = datetime.date.today()
    if argumento.startswith("mes"):
        meses = int(argumento[3:] or 12)
        # El informe mensual solo existe cuando el mes cierra: el actual, por dias.
        fechas = [
            ((hoy - datetime.timedelta(days=n)).isoformat(), "DAILY")
            for n in range(1, hoy.day)
        ]
        ano, mes = hoy.year, hoy.month
        for _ in range(meses):
            mes -= 1
            if mes == 0:
                ano, mes = ano - 1, 12
            fechas.append((f"{ano:04d}-{mes:02d}", "MONTHLY"))
        return f"ultimos {meses} meses", fechas

    dias = int(argumento)
    return (
        f"ultimos {dias} dias",
        [((hoy - datetime.timedelta(days=n)).isoformat(), "DAILY") for n in range(1, dias + 1)],
    )


def main():
    argumentos = [a for a in sys.argv[1:] if a != "--json"]
    destino = None
    if "--json" in sys.argv:
        destino = pathlib.Path(argumentos.pop())

    rotulo, fechas = periodos(argumentos[0] if argumentos else "7")
    catalogo = apps()
    if not destino:
        print(f"clave valida: {len(catalogo)} apps en la cuenta\n")

    if not VENDOR:
        for sku, (nombre, _) in sorted(catalogo.items(), key=lambda x: x[1][0]):
            print(f"  {nombre:<30} {sku}")
        print("\nFalta ASC_VENDOR para pedir los informes de ventas.")
        return

    cuenta = collections.defaultdict(lambda: collections.Counter())
    paises = collections.Counter()
    for fecha, frecuencia in fechas:
        for fila in informe(fecha, frecuencia):
            sku = fila["SKU"]
            tipo = fila["Product Type Identifier"]
            unidades = int(fila["Units"])
            cuenta[sku][tipo] += unidades
            if not tipo.startswith("7"):
                paises[fila["Country Code"]] += unidades

    # Los tipos que empiezan por 7 son actualizaciones, no instalaciones nuevas.
    nuevas = {
        sku: sum(n for t, n in tipos.items() if not t.startswith("7"))
        for sku, tipos in cuenta.items()
    }

    if destino:
        if not nuevas:
            sys.exit("sin datos: no se reescribe el json")
        destino.write_text(
            json.dumps(
                {
                    "actualizado": datetime.date.today().isoformat(),
                    "meses": 12,
                    "paises": len(paises),
                    "apps": {
                        catalogo[sku][1]: unidades
                        for sku, unidades in sorted(nuevas.items())
                        if sku in catalogo and unidades
                    },
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"escrito {destino}")
        return

    if not cuenta:
        print(f"sin ventas registradas en los {rotulo}")
        return

    print(f"{rotulo}\n")
    print(f"{'app':<30}{'descargas':>10}{'actualiz.':>10}")
    for sku, tipos in sorted(cuenta.items(), key=lambda x: -sum(x[1].values())):
        updates = sum(n for t, n in tipos.items() if t.startswith("7"))
        nombre = catalogo[sku][0] if sku in catalogo else sku
        print(f"{nombre:<30}{nuevas[sku]:>10}{updates:>10}")

    print("\npor pais")
    for pais, unidades in paises.most_common(10):
        print(f"  {pais}  {unidades}")


if __name__ == "__main__":
    main()
