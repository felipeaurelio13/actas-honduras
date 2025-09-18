# hn-icr-diputados-cloud-v1

Conteo paralelo de **Actas de Cierre – Diputados (Honduras)** usando **3 agentes cloud** en paralelo:
1) **OpenAI Vision** (Structured Outputs)
2) **Google Document AI**
3) **AWS Textract**

**v1**: app local, sin BD. JSONs en `outputs/` (A/B/C/CONSENSO). `/dashboard` suma los **CONSENSO**.

## Requisitos
- Python 3.11
- Credenciales (OpenAI, GCP Document AI, AWS Textract)

## Setup
\`\`\`bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.main
\`\`\`

## Uso
- `http://127.0.0.1:8000` → subir imagen (acta Diputados)
- Ver A/B/C/CONSENSO y descargar JSONs
- `http://127.0.0.1:8000/dashboard` → sumatoria por partido (desde CONSENSO)

## Política
- Si hay duda: `ND` (no inventar)
- CONSENSO pide ≥2 agentes de acuerdo por campo
