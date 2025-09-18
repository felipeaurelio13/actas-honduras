import os, boto3
from typing import Dict, Any, List
from app.schema import ActaJSON, Meta, Verificaciones, Header
from app.hn_parser import parse_text_to_fields

def _assemble_text(blocks):
    lines = [b['Text'] for b in blocks if b.get('BlockType')=='LINE' and 'Text' in b]
    return "\n".join(lines)

def _extract_tables(blocks):
    id_map = {b['Id']: b for b in blocks if 'Id' in b}
    tables = []
    for b in blocks:
        if b.get('BlockType') == 'TABLE':
            cells = []
            for rel in b.get('Relationships', []):
                if rel['Type']=='CHILD':
                    for cid in rel['Ids']:
                        cb = id_map.get(cid, {})
                        if cb.get('BlockType')=='CELL':
                            cells.append(cb)
            max_row = max((c.get('RowIndex',0) for c in cells), default=0)
            max_col = max((c.get('ColumnIndex',0) for c in cells), default=0)
            grid = [["" for _ in range(max_col)] for __ in range(max_row)]
            for c in cells:
                txt = ""
                for rel in c.get('Relationships',[]):
                    if rel['Type']=='CHILD':
                        for wid in rel['Ids']:
                            w = id_map.get(wid, {})
                            if w.get('BlockType') in ('WORD','SELECTION_ELEMENT') and 'Text' in w:
                                txt += (w['Text'] + " ")
                r = c.get('RowIndex',1)-1; col = c.get('ColumnIndex',1)-1
                if 0<=r<len(grid) and 0<=col<len(grid[0]):
                    grid[r][col] = txt.strip()
            tables.append(grid)
    return tables

def run(image_bgr, filename: str) -> ActaJSON:
    import cv2
    _, buf = cv2.imencode(".jpg", image_bgr)
    bytes_ = buf.tobytes()

    region = os.getenv("AWS_REGION","us-east-1")
    client = boto3.client('textract', region_name=region)

    resp = client.analyze_document(Document={'Bytes': bytes_}, FeatureTypes=['FORMS','TABLES'])
    blocks = resp.get('Blocks', [])
    full_text = _assemble_text(blocks)
    tablas = _extract_tables(blocks)

    header, partidos, totales = parse_text_to_fields(full_text)

    verif = Verificaciones(
        suma_partidos_igual_validos = (sum([p['votos'] for p in partidos])== (totales.get('validos') or 0)) if partidos and (totales.get('validos') is not None) else None,
        suma_global_coherente = True if totales.get('total_sumado') is not None else None,
        campos_firma_presentes = None
    )
    meta = Meta(fuente=filename, agente="AWS_TEXTRACT", confianza_global=0.0)
    acta = ActaJSON(
        meta=meta,
        header=Header(**header),
        resultados={"partidos": partidos, "totales": totales, "tablas_brutas": tablas},
        verificaciones=verif,
        observaciones=None
    )
    return acta
