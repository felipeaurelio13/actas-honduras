from typing import List, Dict, Any, Optional
from collections import Counter
import json

def _norm_str(s): 
    return None if s is None else " ".join(str(s).upper().split())

def _majority_str(values: List[Optional[str]]):
    vals = [_norm_str(v) for v in values if v]
    if not vals: return None
    winner, count = Counter(vals).most_common(1)[0]
    return winner if count >= 2 else None

def _majority_int(values: List[Any], tol=0):
    nums = [v for v in values if isinstance(v,int)]
    if not nums: return None
    for v in nums:
        if sum(1 for x in nums if abs(x-v)<=tol) >= 2:
            return v
    return None

def _merge_partidos(listas: List[List[Dict[str,Any]]]):
    index = {}
    for lst in listas:
        for p in (lst or []):
            key = _norm_str(p.get("nombre"))
            if not key: continue
            index.setdefault(key, []).append(p)
    merged = []
    for k, arr in index.items():
        votos = _majority_int([a.get("votos") for a in arr])
        merged.append({
            "nombre": arr[0]["nombre"],
            "votos": votos
        })
    return merged

def _bool_cons(vals):
    vs = [v for v in vals if isinstance(v,bool)]
    if not vs: return None
    return True if vs.count(True)>=2 else (False if vs.count(False)>=2 else None)

def _clean_table(table: Any) -> List[List[str]]:
    if not isinstance(table, list):
        return []
    cleaned: List[List[str]] = []
    for row in table:
        if not isinstance(row, list):
            continue
        cleaned_row = [str(cell).strip() if cell is not None else "" for cell in row]
        if any(cell for cell in cleaned_row):
            cleaned.append([cell for cell in cleaned_row])
    return cleaned

def _merge_tablas(tablas: List[Any]) -> List[List[str]]:
    candidatas = []
    for tabla in tablas:
        limpia = _clean_table(tabla)
        if limpia:
            candidatas.append(limpia)

    if not candidatas:
        return []

    registros: Dict[str, Dict[str, Any]] = {}
    for tabla in candidatas:
        clave = json.dumps(tabla, ensure_ascii=False)
        llenas = sum(1 for fila in tabla for celda in fila if celda)
        existente = registros.get(clave)
        if existente:
            existente["conteo"] += 1
            if llenas > existente["llenas"] or (llenas == existente["llenas"] and len(tabla) > len(existente["tabla"])):
                existente.update({"tabla": tabla, "llenas": llenas})
        else:
            registros[clave] = {"tabla": tabla, "conteo": 1, "llenas": llenas}

    ordenadas = sorted(
        registros.values(),
        key=lambda item: (item["conteo"], item["llenas"], len(item["tabla"])),
        reverse=True,
    )

    mejor = ordenadas[0]
    if mejor["conteo"] >= 2:
        return mejor["tabla"]

    fallback = max(
        candidatas,
        key=lambda tabla: (sum(1 for fila in tabla for celda in fila if celda), len(tabla)),
    )
    return fallback

def _consensus_confianza(payloads: List[Dict[str, Any]]) -> float:
    valores = [p.get("meta", {}).get("confianza_global") for p in payloads]
    numeros = [v for v in valores if isinstance(v, (int, float))]
    if not numeros:
        return 0.75
    promedio = sum(numeros) / len(numeros)
    ajuste = 0.05 if len(numeros) == 3 else (0.02 if len(numeros) >= 2 else 0)
    confianza = min(0.99, promedio + ajuste)
    return round(confianza, 2)

def make_consensus(A:dict,B:dict,C:dict)->dict:
    keys = ["departamento","municipio","centro_votacion","jrv","codigo_acta"]
    header = {k: _majority_str([A["header"].get(k), B["header"].get(k), C["header"].get(k)]) for k in keys}

    partidos = _merge_partidos([A["resultados"].get("partidos"), B["resultados"].get("partidos"), C["resultados"].get("partidos")])
    tkeys = ["validos","nulos","blancos","total_sumado"]
    totales = {k: _majority_int([A["resultados"]["totales"].get(k), B["resultados"]["totales"].get(k), C["resultados"]["totales"].get(k)]) for k in tkeys}
    tablas = _merge_tablas([
        A["resultados"].get("tablas_brutas"),
        B["resultados"].get("tablas_brutas"),
        C["resultados"].get("tablas_brutas"),
    ])

    verificaciones = {
        "suma_partidos_igual_validos": _bool_cons([A["verificaciones"].get("suma_partidos_igual_validos"), B["verificaciones"].get("suma_partidos_igual_validos"), C["verificaciones"].get("suma_partidos_igual_validos")]),
        "suma_global_coherente": _bool_cons([A["verificaciones"].get("suma_global_coherente"), B["verificaciones"].get("suma_global_coherente"), C["verificaciones"].get("suma_global_coherente")]),
        "campos_firma_presentes": _bool_cons([A["verificaciones"].get("campos_firma_presentes"), B["verificaciones"].get("campos_firma_presentes"), C["verificaciones"].get("campos_firma_presentes")]),
    }

    agentes = [A.get("meta", {}).get("agente"), B.get("meta", {}).get("agente"), C.get("meta", {}).get("agente")]
    presentes = [a for a in agentes if a]

    return {
        "meta": {
            "nivel":"Diputados",
            "pais":"Honduras",
            "fuente":"CONSENSO",
            "version_schema":"1.1.1",
            "agente":"CONSENSO",
            "confianza_global": _consensus_confianza([A, B, C]),
        },
        "header": header,
        "resultados": {"partidos": partidos, "totales": totales, "tablas_brutas": tablas},
        "verificaciones": verificaciones,
        "observaciones": (
            f"Consenso generado a partir de {len(presentes)} agentes: {', '.join(presentes)}"
            if presentes else None
        )
    }
