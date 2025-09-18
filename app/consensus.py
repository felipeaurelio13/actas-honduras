from typing import List, Dict, Any, Optional
from collections import Counter

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

def make_consensus(A:dict,B:dict,C:dict)->dict:
    keys = ["departamento","municipio","centro_votacion","jrv","codigo_acta"]
    header = {k: _majority_str([A["header"].get(k), B["header"].get(k), C["header"].get(k)]) for k in keys}

    partidos = _merge_partidos([A["resultados"].get("partidos"), B["resultados"].get("partidos"), C["resultados"].get("partidos")])
    tkeys = ["validos","nulos","blancos","total_sumado"]
    totales = {k: _majority_int([A["resultados"]["totales"].get(k), B["resultados"]["totales"].get(k), C["resultados"]["totales"].get(k)]) for k in tkeys}

    verificaciones = {
        "suma_partidos_igual_validos": _bool_cons([A["verificaciones"].get("suma_partidos_igual_validos"), B["verificaciones"].get("suma_partidos_igual_validos"), C["verificaciones"].get("suma_partidos_igual_validos")]),
        "suma_global_coherente": _bool_cons([A["verificaciones"].get("suma_global_coherente"), B["verificaciones"].get("suma_global_coherente"), C["verificaciones"].get("suma_global_coherente")]),
        "campos_firma_presentes": _bool_cons([A["verificaciones"].get("campos_firma_presentes"), B["verificaciones"].get("campos_firma_presentes"), C["verificaciones"].get("campos_firma_presentes")]),
    }

    return {
        "meta": {"nivel":"Diputados","pais":"Honduras","fuente":"CONSENSO","version_schema":"1.1.0","agente":"CONSENSO","confianza_global":0.0},
        "header": header,
        "resultados": {"partidos": partidos, "totales": totales},
        "verificaciones": verificaciones,
        "observaciones": None
    }
