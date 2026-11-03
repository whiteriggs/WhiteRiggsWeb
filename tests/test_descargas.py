import datetime
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
import contextlib
import io
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("descargas", ROOT / "scripts/descargas.py")
descargas = importlib.util.module_from_spec(spec)
with patch.dict(os.environ, {
    "ASC_KEY": "/unused/test.p8", "ASC_KEY_ID": "test",
    "ASC_ISSUER": "test", "ASC_VENDOR": "test",
}):
    spec.loader.exec_module(descargas)

BUNDLE = "WhiteRiggs.Curiosity"
CATALOGO = {"curiosity": ("Curiosity", BUNDLE), "old": ("Old", "Javi.com.TimeClock")}


def fila(unidades, tipo="1", sku="curiosity", pais="ES"):
    return {
        "SKU": sku, "Product Type Identifier": tipo,
        "Units": str(unidades), "Country Code": pais,
    }


def archivo():
    return {"version": 1, "desde": "2026-01-01", "informes": {}}


class TotalTests(unittest.TestCase):
    def acumular(self, cache, hoy, informes):
        self.assertTrue(
            callable(getattr(descargas, "acumular_total", None)),
            "Falta el acumulado historico, independiente de la ventana anual",
        )
        with patch.object(descargas, "informe", side_effect=informes):
            return descargas.acumular_total(CATALOGO, cache, hoy)

    def test_octubre_no_desaparece_el_uno_de_noviembre(self):
        def informes(fecha, frecuencia):
            if fecha == "2026-10-31":
                return [fila(40)]
            if fecha == "2026-09":
                return [fila(591)]
            return []

        datos, cache = self.acumular(archivo(), datetime.date(2026, 11, 1), informes)
        self.assertEqual(datos["apps"][BUNDLE], 631)
        self.assertEqual(datos["periodo"], "total")
        self.assertEqual(datos["hasta"], "2026-10-31")
        self.assertIn("DAILY:2026-10-31", cache["informes"])

    def test_mensual_sustituye_diarios_sin_duplicarlos(self):
        cache = archivo()
        cache["informes"]["DAILY:2026-10-31"] = {"apps": {BUNDLE: 40}, "paises": ["ES"]}

        def informes(fecha, frecuencia):
            return [fila(40)] if fecha == "2026-10" else []

        datos, nuevo = self.acumular(cache, datetime.date(2026, 11, 6), informes)
        self.assertEqual(datos["apps"][BUNDLE], 40)
        self.assertNotIn("DAILY:2026-10-31", nuevo["informes"])
        self.assertIn("MONTHLY:2026-10", nuevo["informes"])

    def test_repetir_actualizacion_no_suma_dos_veces(self):
        datos, cache = self.acumular(
            archivo(), datetime.date(2026, 1, 3), lambda *_: [fila(2)]
        )
        repetido, _ = self.acumular(
            cache, datetime.date(2026, 1, 3),
            lambda *_: self.fail("Los informes ya guardados no se vuelven a sumar"),
        )
        self.assertEqual(datos["apps"][BUNDLE], 4)
        self.assertEqual(repetido["apps"], datos["apps"])

    def test_cambio_de_ano_conserva_meses_anteriores(self):
        cache = archivo()
        cache["informes"]["MONTHLY:2026-03"] = {"apps": {BUNDLE: 625}, "paises": ["ES"]}
        datos, _ = self.acumular(
            cache, datetime.date(2027, 1, 2),
            lambda fecha, _: [fila(1)] if fecha == "2027-01-01" else [],
        )
        self.assertEqual(datos["apps"][BUNDLE], 626)

    def test_mensual_retrasado_usa_diarios_incluso_pasado_el_dia_cinco(self):
        def informes(fecha, frecuencia):
            if fecha == "2026-10":
                return None
            return [fila(3)] if fecha == "2026-10-31" else []

        datos, _ = self.acumular(archivo(), datetime.date(2026, 11, 6), informes)
        self.assertEqual(datos["apps"][BUNDLE], 3)

    def test_diario_pendiente_aborta_sin_modificar_historico(self):
        cache = archivo()
        original = json.dumps(cache)
        with self.assertRaisesRegex(RuntimeError, "2026-01-01"):
            self.acumular(cache, datetime.date(2026, 1, 2), lambda *_: None)
        self.assertEqual(json.dumps(cache), original)

    def test_cuenta_descargas_y_redescargas_no_actualizaciones_ni_compras(self):
        filas = [fila(2, tipo) for tipo in ("1", "1F", "1T", "F1", "1E", "1EP", "1EU", "3", "3F")]
        filas += [fila(99, tipo, pais="US") for tipo in ("7", "7F", "F7", "IA1")]
        filas += [fila(100, sku="old", pais="FR")]
        datos, _ = self.acumular(archivo(), datetime.date(2026, 1, 2), lambda *_: filas)
        self.assertEqual(datos["apps"], {BUNDLE: 18})
        self.assertEqual(datos["paises"], 1)

    def test_no_convierte_json_anual_en_historico(self):
        with self.assertRaisesRegex(ValueError, "historico"):
            self.acumular(
                {"meses": 12, "apps": {BUNDLE: 592}},
                datetime.date(2026, 11, 3), lambda *_: [],
            )

    def test_main_escribe_total_e_historico(self):
        with tempfile.TemporaryDirectory() as carpeta:
            destino = pathlib.Path(carpeta) / "descargas.json"
            with patch.object(descargas, "apps", return_value=CATALOGO), \
                 patch.object(descargas, "informe", return_value=[fila(1)]), \
                 patch("sys.argv", ["descargas.py", "total", "--json", str(destino)]):
                descargas.main()
            datos = json.loads(destino.read_text())
            cache = json.loads((destino.parent / "descargas-historico.json").read_text())
            self.assertEqual(datos["periodo"], "total")
            self.assertGreater(datos["apps"][BUNDLE], 0)
            self.assertEqual(cache["desde"], "2026-01-01")

    def test_error_no_sobrescribe_total_publicado(self):
        with tempfile.TemporaryDirectory() as carpeta:
            destino = pathlib.Path(carpeta) / "descargas.json"
            destino.write_text('{"apps": {"WhiteRiggs.Curiosity": 631}}')
            anterior = destino.read_text()
            with patch.object(descargas, "apps", return_value=CATALOGO), \
                 patch.object(descargas, "informe", side_effect=RuntimeError("HTTP 503")), \
                 patch("sys.argv", ["descargas.py", "total", "--json", str(destino)]):
                with self.assertRaisesRegex(RuntimeError, "503"):
                    descargas.main()
            self.assertEqual(destino.read_text(), anterior)
            self.assertFalse((destino.parent / "descargas-historico.json").exists())


class InformeTests(unittest.TestCase):
    def test_error_de_api_no_se_interpreta_como_cero(self):
        for codigo in (401, 403, 410, 429, 500):
            with self.subTest(codigo=codigo), \
                 patch.object(descargas, "pedir", return_value=(None, (codigo, "error"))):
                with self.assertRaisesRegex(RuntimeError, str(codigo)):
                    descargas.informe("2026-10", "MONTHLY")

    def test_informe_pendiente_se_distingue_de_cero_ventas(self):
        with patch.object(descargas, "pedir", return_value=(None, (404, "Report not available yet"))), \
             contextlib.redirect_stderr(io.StringIO()) as errores:
            self.assertIsNone(descargas.informe("2026-10", "MONTHLY"))
        self.assertIn("informe pendiente", errores.getvalue())

    def test_cero_ventas_confirmado(self):
        with patch.object(descargas, "pedir", return_value=(
            None, (404, '{"errors": [{"detail": "There were no sales for the date specified."}]}')
        )):
            self.assertEqual(descargas.informe("2026-10-01"), [])


if __name__ == "__main__":
    unittest.main()
