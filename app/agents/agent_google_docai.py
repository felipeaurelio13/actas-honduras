import os
from typing import Dict, Any, List
from google.cloud import documentai as docai
from app.schema import ActaJSON, Meta, Verificaciones, Header
from app.hn_parser import parse_text_to_fields

def _extract_tables(document) -> List[List[str]]:
    full_text = document.text or ""
    tables_out = []
    for page in document.pages:
        for table in page.tables:
            rows = []
            for r in table.header_rows + table.body_rows:
                row = []
                for cell in r.cells:
                    s = ""
                    for seg in cell.layout.text_anchor.text_segments:
                        s += full_text[seg.start_index:seg.end_index]
                    row.append(s.strip())
                rows.append(row)
            if rows:
                tables_out.append(rows)
    return tables_out

def run(image_bgr, filename: str) -> ActaJSON:
    import cv2
    _, buf = cv2.imencode(".jpg", image_bgr)
    content = buf.tobytes()

    project_id = os.getenv("DOC_AI_PROJECT")
    location = os.getenv("DOC_AI_LOCATION","us")
    processor_id = os.getenv("DOC_AI_PROCESSOR_ID")
    if not (project_id and processor_id):
        raise RuntimeError("Missing DOC_AI_* env vars")

    client = docai.DocumentProcessorServiceClient()
    name = client.processor_path(project_id, location, processor_id)

    raw_document = docai.RawDocument(content=content, mime_type="image/jpeg")
    request = docai.ProcessRequest(name=name, raw_document=raw_document)
    result = client.process_document(request=request)
    document = result.document

    full_text = document.text or ""
    header, partidos, totales = parse_text_to_fields(full_text)
    tablas = _extract_tables(document)

    verif = Verificaciones(
        suma_partidos_igual_validos = (sum([p['votos'] for p in partidos])== (totales.get('validos') or 0)) if partidos and (totales.get('validos') is not None) else None,
        suma_global_coherente = True if totales.get('total_sumado') is not None else None,
        campos_firma_presentes = None
    )
    meta = Meta(fuente=filename, agente="GCP_DOC_AI", confianza_global=0.0)
    acta = ActaJSON(
        meta=meta,
        header=Header(**header),
        resultados={"partidos": partidos, "totales": totales, "tablas_brutas": tablas},
        verificaciones=verif,
        observaciones=None
    )
    return acta
