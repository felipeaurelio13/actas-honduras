import os, base64, json
from typing import Dict, Any
from openai import OpenAI
from app.schema import ActaJSON, Meta, Verificaciones, Header
from app.hn_parser import parse_text_to_fields

SCHEMA = {
  "name": "HNDiputadosActa",
  "schema": {
    "type": "object",
    "properties": {
      "full_text": {"type":"string"},
      "tablas_brutas": {"type":"array","items":{"type":"array","items":{"type":"string"}}}
    },
    "required": ["full_text"]
  },
  "strict": True
}

def run(image_bgr, filename: str) -> ActaJSON:
    import cv2
    _, buf = cv2.imencode(".jpg", image_bgr)
    b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    model = os.getenv("OPENAI_VISION_MODEL","gpt-4.1")

    prompt = (
        "You are an expert transcriber for Honduran election tally sheets (Acta de Cierre, nivel Diputados). "
        "Transcribe EXACTLY the text you see (no guessing). "
        "Return 'full_text' with a faithful transcription and, if possible, 'tablas_brutas' as a coarse 2D array (rows of cells) for the main results table. "
        "Do not infer values. If unreadable, skip or leave empty cell."
    )

    resp = client.responses.create(
        model=model,
        input=[{
            "role":"user",
            "content":[
                {"type":"input_text","text": prompt},
                {"type":"input_image","image_data": b64}
            ]
        }],
        response_format={
            "type":"json_schema",
            "json_schema": SCHEMA
        }
    )
    data = json.loads(resp.output[0].content[0].text)

    full_text = data.get("full_text","")
    header, partidos, totales = parse_text_to_fields(full_text)

    verif = Verificaciones(
        suma_partidos_igual_validos = (sum([p['votos'] for p in partidos])== (totales.get('validos') or 0)) if partidos and (totales.get('validos') is not None) else None,
        suma_global_coherente = True if totales.get('total_sumado') is not None else None,
        campos_firma_presentes = None
    )
    meta = Meta(fuente=filename, agente="OPENAI", confianza_global=0.0)
    acta = ActaJSON(
        meta=meta,
        header=Header(**header),
        resultados={"partidos": partidos, "totales": totales, "tablas_brutas": data.get("tablas_brutas", [])},
        verificaciones=verif,
        observaciones=None
    )
    return acta
