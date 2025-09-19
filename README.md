# hn-icr-diputados-cloud-v1

`v1.2.0` – Plataforma para el conteo paralelo de **Actas de Cierre – Diputados (Honduras)** utilizando **tres agentes especializados de OpenAI** que se ejecutan en paralelo, ahora con tipados estrictos y preparada para despliegues estáticos en GitHub Pages.

## Novedades 1.2.0

- **Tipados compartidos y validación con Zod:** la API y el frontend utilizan los mismos contratos (`lib/acta-types.ts`) y se valida la respuesta con Zod antes de actualizar el estado, reduciendo errores silenciosos.
- **Compatibilidad con GitHub Pages:** nuevas fuentes locales (sin dependencias externas) y variable `NEXT_PUBLIC_API_BASE_URL` para conectar con un backend remoto al desplegar la interfaz como sitio estático.
- **Dashboard más consistente:** cálculos de totales y porcentajes centralizados para el consenso, evitando discrepancias y mejorando la visualización móvil.

### Historial 1.1.1

- Consenso más completo: ahora se fusionan las `tablas_brutas` cuando al menos dos agentes coinciden o, en su defecto, se selecciona la tabla más informativa disponible.
- Mayor confiabilidad: el consenso calcula una confianza ponderada según los agentes participantes e indica explícitamente qué agentes aportaron al resultado.
- Correcciones Responses API: el backend utiliza `image_base64` y prioriza `output_text`, evitando errores intermitentes en la extracción del JSON.
- Flujo de calidad listo: `pnpm lint` ya funciona sin instalaciones manuales adicionales gracias a las dependencias de ESLint incluidas.

## Arquitectura

- **Next.js 14** (App Router) con TailwindCSS para la interfaz y la API serverless (`/api/process-acta`).
- **Tres agentes OpenAI** (visión, OCR y análisis documental) invocados desde el backend de Next.js mediante `response_format` con JSON Schema.
- **Consenso automático**: compara encabezados, resultados y verificaciones para consolidar los datos cuando al menos dos agentes están de acuerdo.
- **FastAPI opcional** (`app/main.py`): referencia para ejecutar agentes de OpenAI, Google Document AI y AWS Textract desde un servicio Python tradicional.

## Requisitos

- Node.js 18 o superior (se recomienda PNPM o NPM 9+).
- Cuenta de OpenAI con acceso a modelos multimodales (por ejemplo `gpt-4.1`).
- (Opcional) Python 3.11 + credenciales de GCP/AWS si se desea utilizar el pipeline alterno de FastAPI.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `OPENAI_API_KEY` | **Obligatoria.** Clave de OpenAI con permisos de visión estructurada. |
| `NEXT_PUBLIC_APP_VERSION` | Versión mostrada en el footer (por defecto `v1.2.0`). |
| `NEXT_PUBLIC_API_BASE_URL` | URL base del backend cuando se despliega la interfaz en modo estático (por ejemplo, un servicio en Railway o FastAPI). Déjalo vacío para usar el API interno de Next.js en desarrollo. |
| `OPENAI_DEFAULT_MODEL` | Modelo multimodal a usar cuando no se especifique uno por agente (opcional, `gpt-4.1` por defecto). |
| `OPENAI_VISION_MODEL` | Modelo específico para el agente de inspección visual (opcional). |
| `OPENAI_OCR_MODEL` | Modelo específico para el agente orientado a OCR (opcional). |
| `OPENAI_DOCUMENT_MODEL` | Modelo específico para el agente de análisis documental (opcional). |
| `DOC_AI_PROJECT`, `DOC_AI_LOCATION`, `DOC_AI_PROCESSOR_ID` | Variables necesarias solo para el servicio FastAPI de Google Document AI. |
| `AWS_REGION` | Región para AWS Textract en el servicio FastAPI (opcional, `us-east-1`). |

⚠️ **Las llaves sensibles deben configurarse únicamente en GitHub/GitHub Actions o en tu entorno local, nunca se deben versionar.**

## Instalación y ejecución (Next.js)

```bash
# Instalar dependencias (usa pnpm, npm o yarn)
pnpm install

# Copiar variables de ejemplo
cp .env.example .env.local

# Ejecutar en desarrollo
pnpm dev

# Linter (antes de crear un PR)
pnpm lint
```

La aplicación estará disponible en `http://localhost:3000`. Desde la pestaña **Subir Actas** se cargan imágenes (`.jpg`, `.png`, `.pdf`). El backend envía el archivo a los tres agentes de OpenAI y, al finalizar, permite descargar los JSON individuales y el consenso.

## Flujo de procesamiento

1. **Preprocesamiento** en el navegador: se envía el archivo a `/api/process-acta`.
2. **Agentes en paralelo**: visión, OCR y análisis documental generan JSONs con encabezado, partidos y totales siguiendo un esquema estricto.
3. **Validaciones**: cada respuesta calcula si la suma de partidos coincide con los votos válidos y si los totales cuadran.
4. **Consenso**: si al menos dos agentes coinciden, se produce un JSON final con los campos mayoritarios y se registra el resultado en el dashboard.

## FastAPI opcional

Si necesitas ejecutar los agentes de Google Document AI y AWS Textract, puedes iniciar el servicio incluido:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

El servicio se expone en `http://127.0.0.1:8000`, guarda las salidas en `outputs/` y ofrece un dashboard de agregados. Requiere las credenciales de Google y AWS configuradas mediante variables de entorno.

## Buenas prácticas

- Nunca inventar datos: los agentes y el consenso devuelven `null` cuando un valor es ilegible.
- Mantener enfoque *mobile-first* y minimalista en la interfaz.
- Ejecutar `pnpm lint` antes de subir cambios.
- Actualizar la versión mostrada en el footer (`NEXT_PUBLIC_APP_VERSION`) y documentar cualquier cambio relevante en este README.

## Despliegue en GitHub Pages

1. **Backend**: GitHub Pages sólo puede servir archivos estáticos. Publica el endpoint `/api/process-acta` en un servicio externo (por ejemplo, desplegando este mismo backend de Next.js en Railway/Render o usando el servicio FastAPI incluido en `app/main.py`). Configura ahí las llaves de OpenAI.
2. **Variables**: en GitHub establece `NEXT_PUBLIC_API_BASE_URL` apuntando al dominio público del backend (por ejemplo `https://tu-backend.com`). Deja el valor vacío en desarrollo para consumir la API local de Next.js.
3. **Build estático**: genera la carpeta `out/` habilitando `output: "export"` en una rama de despliegue sólo para la interfaz (sin la carpeta `app/api`). Sigue la guía oficial de Next 14 para exportar sitios estáticos y publica `out/` en la rama que usa GitHub Pages.
4. **Pruebas**: antes de publicar, ejecuta `pnpm lint` y prueba la carga de un acta en el entorno estático para validar la comunicación con el backend remoto.
