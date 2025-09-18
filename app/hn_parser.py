import re
from typing import List, Dict, Any, Optional

PARTY_HINTS = [
    "LIBRE","PARTIDO NACIONAL","PARTIDO LIBERAL","PINU","DC","PAC","VAMOS","UD","PSH","TSH","ALIANZA","ALIANZA PATRIOTICA"
]

def _pick(regex: str, text: str, group: int = 1) -> Optional[str]:
    m = re.search(regex, text, flags=re.I|re.M)
    return m.group(group).strip() if m else None

def parse_text_to_fields(text: str) -> Dict[str, Any]:
    header = {
        "departamento": _pick(r"DEPARTAMENTO[:\s]+([A-ZÁÉÍÓÚÑ \-]{3,})", text),
        "municipio": _pick(r"MUNICIPIO[:\s]+([A-ZÁÉÍÓÚÑ \-]{3,})", text),
        "centro_votacion": _pick(r"(CENTRO DE VOTACI[ÓO]N|CENTRO)[:\s]+(.+)", text, 2),
        "jrv": _pick(r"(JRV|J\.R\.V)[\s#:\-]+([0-9A-Z\-]+)", text, 2),
        "codigo_acta": _pick(r"(C[ÓO]DIGO|CODIGO)[\s#:\-]+([0-9A-Z\-]+)", text, 2),
    }

    def pick_int(lbl):
        m = re.search(rf"{lbl}[:\s]+([0-9]{{1,6}})", text, flags=re.I)
        return int(m.group(1)) if m else None

    totales = {
        "validos": pick_int("V[ÁA]LIDOS"),
        "nulos": pick_int("NULOS"),
        "blancos": pick_int("BLANCOS"),
    }
    if all(v is not None for v in totales.values()):
        totales["total_sumado"] = sum(totales.values())

    partidos = []
    for line in text.splitlines():
        if any(h in line.upper() for h in PARTY_HINTS):
            m = re.search(r"(.+?)\s+([0-9]{1,5})\s*$", line.strip())
            if m:
                nombre = re.sub(r"\s{2,}"," ",m.group(1)).strip()
                votos = int(m.group(2))
                partidos.append({"nombre": nombre, "votos": votos, "confianza": 0.85})

    return header, partidos, totales
