import json
from pathlib import Path
from typing import Dict

def load_consensos(outputs_dir: Path):
    for p in outputs_dir.glob("*.CONSENSO.json"):
        try:
            yield json.loads(p.read_text())
        except Exception:
            continue

def tally(outputs_dir: Path) -> Dict[str,int]:
    totals = {}
    for doc in load_consensos(outputs_dir):
        partidos = doc.get("resultados",{}).get("partidos",[])
        for p in partidos:
            v = p.get("votos")
            if isinstance(v,int):
                name = p.get("nombre","PARTIDO").strip()
                totals[name] = totals.get(name,0) + v
    return dict(sorted(totals.items(), key=lambda kv: (-kv[1], kv[0])))
