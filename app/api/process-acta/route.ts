import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

export const runtime = "nodejs"

const AGENT_PIPELINES = ["openai_vision", "openai_ocr", "openai_document"] as const

const SCHEMA_VERSION = "1.1.1"

type AgentPipeline = (typeof AGENT_PIPELINES)[number]
type AgentErrorKey = `${AgentPipeline}_error`

type NullableString = string | null

type Header = {
  departamento: NullableString
  municipio: NullableString
  centro_votacion: NullableString
  jrv: NullableString
  codigo_acta: NullableString
}

type Totales = {
  validos: number | null
  nulos: number | null
  blancos: number | null
  total_sumado: number | null
}

type Partido = {
  nombre: string
  votos: number | null
}

type LimpiadorActa = {
  header: Header
  resultados: {
    partidos: Partido[]
    totales: Totales
    tablas_brutas: string[][]
  }
}

type Verificaciones = {
  suma_partidos_igual_validos: boolean | null
  suma_global_coherente: boolean | null
  campos_firma_presentes: boolean | null
}

export type ActaPayload = {
  meta: {
    nivel: string
    pais: string
    fuente: string
    timestamp_procesamiento: string
    version_schema: string
    agente: string
    confianza_global: number
  }
  header: Header
  resultados: {
    partidos: Partido[]
    totales: Totales
    tablas_brutas: string[][]
  }
  verificaciones: Verificaciones
  observaciones: string | null
}

type ApiResponsePayload = Record<AgentPipeline, ActaPayload | null> &
  Record<AgentErrorKey, string | null> & { consensus: ActaPayload | null }

const OPENAI_ACTA_SCHEMA = {
  name: "ActaDiputados",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      header: {
        type: "object",
        additionalProperties: false,
        properties: {
          departamento: { type: ["string", "null"] },
          municipio: { type: ["string", "null"] },
          centro_votacion: { type: ["string", "null"] },
          jrv: { type: ["string", "null"] },
          codigo_acta: { type: ["string", "null"] },
        },
        required: ["departamento", "municipio", "centro_votacion", "jrv", "codigo_acta"],
      },
      resultados: {
        type: "object",
        additionalProperties: false,
        properties: {
          partidos: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                nombre: { type: "string" },
                votos: { type: ["integer", "null"] },
              },
              required: ["nombre", "votos"],
            },
          },
          totales: {
            type: "object",
            additionalProperties: false,
            properties: {
              validos: { type: ["integer", "null"] },
              nulos: { type: ["integer", "null"] },
              blancos: { type: ["integer", "null"] },
              total_sumado: { type: ["integer", "null"] },
            },
            required: ["validos", "nulos", "blancos", "total_sumado"],
          },
          tablas_brutas: {
            type: "array",
            items: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        required: ["partidos", "totales", "tablas_brutas"],
      },
    },
    required: ["header", "resultados"],
  },
  strict: true,
} as const

const DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4.1"

const AGENT_CONFIGS: Record<AgentPipeline, { name: string; prompt: string; temperature: number; modelEnv?: string; confidence: number }> = {
  openai_vision: {
    name: "OPENAI_VISION",
    temperature: 0,
    confidence: 0.85,
    modelEnv: "OPENAI_VISION_MODEL",
    prompt:
      "Eres un perito electoral hondureño especializado en inspección visual detallada de actas de cierre de DIPUTADOS. Transcribe únicamente lo que ves de forma legible. Si algún campo es dudoso o ilegible, responde null. Respeta nombres de partidos tal como aparecen y evita inferencias.",
  },
  openai_ocr: {
    name: "OPENAI_OCR",
    temperature: 0.1,
    confidence: 0.8,
    modelEnv: "OPENAI_OCR_MODEL",
    prompt:
      "Eres un motor OCR experto en actas hondureñas de DIPUTADOS. Extrae texto sistemáticamente línea por línea, detecta patrones de partidos y números y devuelve null cuando un dato no está claro. Nunca inventes cifras.",
  },
  openai_document: {
    name: "OPENAI_DOCUMENT",
    temperature: 0.05,
    confidence: 0.82,
    modelEnv: "OPENAI_DOCUMENT_MODEL",
    prompt:
      "Eres un analista documental hondureño. Comprende la estructura del acta (encabezado, tabla de partidos y totales) y extrae los datos manteniendo su formato exacto. Usa null cuando algún dato no pueda confirmarse visualmente.",
  },
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Configuración de OpenAI faltante" }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64Image = buffer.toString("base64")

    console.log(`[process-acta] Procesando ${file.name} (${file.size} bytes) con ${AGENT_PIPELINES.length} agentes`)

    const client = new OpenAI({ apiKey })
    const tasks = AGENT_PIPELINES.map((pipeline) =>
      processWithOpenAI(client, base64Image, file.name, pipeline),
    )
    const settled = await Promise.allSettled(tasks)

    const payload = createBaseResponse()

    settled.forEach((result, index) => {
      const key = AGENT_PIPELINES[index]
      if (result.status === "fulfilled") {
        payload[key] = result.value
      } else {
        const errorMessage = toErrorMessage(result.reason)
        payload[`${key}_error` as AgentErrorKey] = errorMessage
        console.error(`[process-acta] ${key} falló: ${errorMessage}`)
      }
    })

    const successCount = AGENT_PIPELINES.filter((key) => payload[key]).length
    console.log(`[process-acta] Agentes exitosos: ${successCount}`)

    if (successCount >= 2) {
      const consensus = generateConsensus(payload)
      if (consensus) {
        payload.consensus = consensus
      }
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error("[process-acta] Error inesperado:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

function createBaseResponse(): ApiResponsePayload {
  return {
    openai_vision: null,
    openai_vision_error: null,
    openai_ocr: null,
    openai_ocr_error: null,
    openai_document: null,
    openai_document_error: null,
    consensus: null,
  } as ApiResponsePayload
}

function resolveModel(agentKey: AgentPipeline): string {
  const config = AGENT_CONFIGS[agentKey]
  if (config.modelEnv) {
    const envModel = process.env[config.modelEnv]
    if (envModel) {
      return envModel
    }
  }
  return DEFAULT_MODEL
}

async function processWithOpenAI(
  client: OpenAI,
  base64Image: string,
  filename: string,
  agentKey: AgentPipeline,
): Promise<ActaPayload> {
  const config = AGENT_CONFIGS[agentKey]
  const model = resolveModel(agentKey)

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `${config.prompt}\n\nDevuelve un JSON válido que cumpla el siguiente esquema. Si un dato no se ve claro, usa null.`,
            },
            {
              type: "input_image",
              image_base64: base64Image,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: OPENAI_ACTA_SCHEMA,
      },
      temperature: config.temperature,
      max_output_tokens: 1800,
    })

    const text = extractResponseText(response)
    const parsed = JSON.parse(text)
    const cleaned = validateAndCleanResult(parsed)
    const verificaciones = buildVerificaciones(cleaned)

    return {
      meta: {
        nivel: "Diputados",
        pais: "Honduras",
        fuente: filename,
        timestamp_procesamiento: new Date().toISOString(),
        version_schema: SCHEMA_VERSION,
        agente: config.name,
        confianza_global: config.confidence,
      },
      header: cleaned.header,
      resultados: cleaned.resultados,
      verificaciones,
      observaciones: null,
    }
  } catch (error) {
    throw new Error(`${config.name}: ${toErrorMessage(error)}`)
  }
}

function extractResponseText(response: unknown): string {
  const outputText = (response as any)?.output_text
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText
  }

  if (Array.isArray(outputText)) {
    const text = outputText.join("\n").trim()
    if (text.length > 0) {
      return text
    }
  }

  const outputItems = (response as any)?.output
  if (Array.isArray(outputItems)) {
    for (const item of outputItems) {
      const content = item?.content
      if (Array.isArray(content)) {
        for (const chunk of content) {
          if (typeof chunk?.text === "string" && chunk.text.trim().length > 0) {
            return chunk.text
          }
        }
      }
    }
  }

  throw new Error("La respuesta de OpenAI no contiene JSON legible")
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const int = Math.round(value)
    return int >= 0 ? int : null
  }
  if (typeof value === "string") {
    const numeric = value.replace(/[^0-9]/g, "")
    if (!numeric) return null
    const int = Number.parseInt(numeric, 10)
    return Number.isFinite(int) ? int : null
  }
  return null
}

function sanitizeTable(table: unknown): string[] {
  if (!Array.isArray(table)) return []
  return table.map((cell) => (typeof cell === "string" ? cell.trim() : ""))
}

function validateAndCleanResult(raw: any): LimpiadorActa {
  const header: Header = {
    departamento: sanitizeText(raw?.header?.departamento),
    municipio: sanitizeText(raw?.header?.municipio),
    centro_votacion: sanitizeText(raw?.header?.centro_votacion),
    jrv: sanitizeText(raw?.header?.jrv),
    codigo_acta: sanitizeText(raw?.header?.codigo_acta),
  }

  const partidos: Partido[] = Array.isArray(raw?.resultados?.partidos)
    ? raw.resultados.partidos
        .map((partido: any) => {
          const nombre = sanitizeText(partido?.nombre)
          if (!nombre) return null
          return {
            nombre,
            votos: toInt(partido?.votos),
          }
        })
        .filter((partido: Partido | null): partido is Partido => partido !== null)
    : []

  const totales: Totales = {
    validos: toInt(raw?.resultados?.totales?.validos),
    nulos: toInt(raw?.resultados?.totales?.nulos),
    blancos: toInt(raw?.resultados?.totales?.blancos),
    total_sumado: toInt(raw?.resultados?.totales?.total_sumado),
  }

  if (
    totales.total_sumado === null &&
    typeof totales.validos === "number" &&
    typeof totales.nulos === "number" &&
    typeof totales.blancos === "number"
  ) {
    totales.total_sumado = totales.validos + totales.nulos + totales.blancos
  }

  const tablas_brutas: string[][] = Array.isArray(raw?.resultados?.tablas_brutas)
    ? raw.resultados.tablas_brutas
        .map((row: unknown) => sanitizeTable(row))
        .filter((row: string[]) => row.some((cell) => cell.length > 0))
    : []

  return {
    header,
    resultados: {
      partidos,
      totales,
      tablas_brutas,
    },
  }
}

function buildVerificaciones(data: LimpiadorActa): Verificaciones {
  const votosValidos = data.resultados.partidos
    .map((partido) => partido.votos)
    .filter((votos): votos is number => typeof votos === "number")

  const sumPartidos = votosValidos.reduce((acc, votos) => acc + votos, 0)
  const validos = data.resultados.totales.validos
  const sumaPartidosIgualValidos =
    votosValidos.length > 0 && typeof validos === "number" ? sumPartidos === validos : null

  const { nulos, blancos, total_sumado } = data.resultados.totales
  const sumaGlobalCoherente =
    typeof validos === "number" &&
    typeof nulos === "number" &&
    typeof blancos === "number" &&
    typeof total_sumado === "number"
      ? validos + nulos + blancos === total_sumado
      : null

  return {
    suma_partidos_igual_validos: sumaPartidosIgualValidos,
    suma_global_coherente: sumaGlobalCoherente,
    campos_firma_presentes: null,
  }
}

function generateConsensus(payload: ApiResponsePayload): ActaPayload | null {
  const participantes = AGENT_PIPELINES.map((key) => {
    const data = payload[key]
    if (!data) return null
    return { key, data }
  }).filter((entry): entry is { key: AgentPipeline; data: ActaPayload } => entry !== null)

  if (participantes.length < 2) {
    return null
  }

  const header: Header = {
    departamento: getMajorityValue(participantes.map((agente) => agente.data.header.departamento)),
    municipio: getMajorityValue(participantes.map((agente) => agente.data.header.municipio)),
    centro_votacion: getMajorityValue(participantes.map((agente) => agente.data.header.centro_votacion)),
    jrv: getMajorityValue(participantes.map((agente) => agente.data.header.jrv)),
    codigo_acta: getMajorityValue(participantes.map((agente) => agente.data.header.codigo_acta)),
  }

  const partidos = mergePartidos(participantes.map((agente) => agente.data.resultados.partidos))

  const totales: Totales = {
    validos: getMajorityNumber(
      participantes
        .map((agente) => agente.data.resultados.totales.validos)
        .filter((valor): valor is number => typeof valor === "number"),
    ),
    nulos: getMajorityNumber(
      participantes
        .map((agente) => agente.data.resultados.totales.nulos)
        .filter((valor): valor is number => typeof valor === "number"),
    ),
    blancos: getMajorityNumber(
      participantes
        .map((agente) => agente.data.resultados.totales.blancos)
        .filter((valor): valor is number => typeof valor === "number"),
    ),
    total_sumado: getMajorityNumber(
      participantes
        .map((agente) => agente.data.resultados.totales.total_sumado)
        .filter((valor): valor is number => typeof valor === "number"),
    ),
  }

  const verificaciones: Verificaciones = {
    suma_partidos_igual_validos: consensusBoolean(
      participantes.map((agente) => agente.data.verificaciones.suma_partidos_igual_validos),
    ),
    suma_global_coherente: consensusBoolean(
      participantes.map((agente) => agente.data.verificaciones.suma_global_coherente),
    ),
    campos_firma_presentes: consensusBoolean(
      participantes.map((agente) => agente.data.verificaciones.campos_firma_presentes),
    ),
  }

  const tablas_brutas = mergeTablas(
    participantes.map((agente) => agente.data.resultados.tablas_brutas ?? []),
  )

  const confianzaGlobal = calculateConsensusConfidence(
    participantes.map((agente) => agente.data.meta.confianza_global),
  )

  const agentesInvolucrados = participantes
    .map((agente) => AGENT_CONFIGS[agente.key]?.name ?? agente.key)
    .join(", ")

  return {
    meta: {
      nivel: "Diputados",
      pais: "Honduras",
      fuente: "CONSENSO",
      timestamp_procesamiento: new Date().toISOString(),
      version_schema: SCHEMA_VERSION,
      agente: "CONSENSO",
      confianza_global: confianzaGlobal,
    },
    header,
    resultados: {
      partidos,
      totales,
      tablas_brutas,
    },
    verificaciones,
    observaciones: `Consenso generado a partir de ${participantes.length} agentes: ${agentesInvolucrados}`,
  }
}

function mergeTablas(tablas: string[][][]): string[][] {
  const candidatas = tablas
    .filter((tabla): tabla is string[][] => Array.isArray(tabla) && tabla.length > 0)
    .map((tabla) =>
      tabla.map((fila) =>
        fila
          .map((celda) => {
            if (typeof celda === "string") return celda.trim()
            if (typeof celda === "number" && Number.isFinite(celda)) {
              return String(celda)
            }
            return ""
          })
          .map((celda) => celda.normalize("NFKC")),
      ),
    )

  if (candidatas.length === 0) {
    return []
  }

  const registros = new Map<
    string,
    { tabla: string[][]; conteo: number; celdasRellenas: number; filas: number }
  >()

  candidatas.forEach((tabla) => {
    const clave = JSON.stringify(tabla)
    const celdasRellenas = tabla.reduce(
      (acc, fila) => acc + fila.filter((celda) => celda.length > 0).length,
      0,
    )
    const filas = tabla.length
    const existente = registros.get(clave)
    if (existente) {
      existente.conteo += 1
      if (
        celdasRellenas > existente.celdasRellenas ||
        (celdasRellenas === existente.celdasRellenas && filas > existente.filas)
      ) {
        registros.set(clave, { tabla, conteo: existente.conteo, celdasRellenas, filas })
      }
    } else {
      registros.set(clave, { tabla, conteo: 1, celdasRellenas, filas })
    }
  })

  const ordenadas = Array.from(registros.values()).sort(
    (a, b) =>
      b.conteo - a.conteo ||
      b.celdasRellenas - a.celdasRellenas ||
      b.filas - a.filas,
  )

  const mejor = ordenadas[0]
  if (mejor.conteo >= 2) {
    return mejor.tabla
  }

  const fallback = candidatas
    .map((tabla) => ({
      tabla,
      celdasRellenas: tabla.reduce(
        (acc, fila) => acc + fila.filter((celda) => celda.length > 0).length,
        0,
      ),
      filas: tabla.length,
    }))
    .sort(
      (a, b) =>
        b.celdasRellenas - a.celdasRellenas ||
        b.filas - a.filas,
    )
  return fallback[0]?.tabla ?? []
}

function calculateConsensusConfidence(valores: number[]): number {
  const validos = valores.filter((valor) => typeof valor === "number" && Number.isFinite(valor))
  if (validos.length === 0) {
    return 0.75
  }

  const promedio = validos.reduce((acc, valor) => acc + valor, 0) / validos.length
  const ajuste = validos.length === AGENT_PIPELINES.length ? 0.05 : validos.length >= 2 ? 0.02 : 0
  const confianza = Math.min(0.99, promedio + ajuste)
  return Number(confianza.toFixed(2))
}

function mergePartidos(listas: Partido[][]): Partido[] {
  const mapa = new Map<string, { nombre: string; votos: (number | null)[] }>()

  listas.forEach((lista) => {
    lista.forEach((partido) => {
      const nombre = sanitizeText(partido?.nombre)
      if (!nombre) return
      const clave = nombre.toUpperCase()
      const existente = mapa.get(clave)
      if (existente) {
        existente.votos.push(partido.votos)
      } else {
        mapa.set(clave, { nombre, votos: [partido.votos] })
      }
    })
  })

  return Array.from(mapa.values())
    .map(({ nombre, votos }) => {
      const valores = votos.filter((valor): valor is number => typeof valor === "number")
      return {
        nombre,
        votos: getMajorityNumber(valores),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

function getMajorityValue(values: (string | null)[]): string | null {
  const filtrados = values.filter((valor): valor is string => typeof valor === "string" && valor.trim().length > 0)
  if (filtrados.length === 0) return null

  const contador = new Map<string, { valor: string; conteo: number }>()
  filtrados.forEach((valor) => {
    const clave = valor.trim().toUpperCase()
    const existente = contador.get(clave)
    if (existente) {
      existente.conteo += 1
    } else {
      contador.set(clave, { valor: valor.trim(), conteo: 1 })
    }
  })

  const lista = Array.from(contador.values()).sort((a, b) => b.conteo - a.conteo)
  return lista[0].conteo >= 2 ? lista[0].valor : null
}

function getMajorityNumber(values: number[]): number | null {
  if (values.length === 0) return null

  const grupos: Map<number, number[]> = new Map()
  values.forEach((valor) => {
    const clave = valor
    if (!grupos.has(clave)) {
      grupos.set(clave, [valor])
    } else {
      grupos.get(clave)!.push(valor)
    }
  })

  const lista = Array.from(grupos.entries()).sort((a, b) => b[1].length - a[1].length)
  const [numero, coincidencias] = lista[0]
  return coincidencias.length >= 2 ? numero : null
}

function consensusBoolean(values: (boolean | null)[]): boolean | null {
  const booleanos = values.filter((valor): valor is boolean => typeof valor === "boolean")
  if (booleanos.length === 0) return null
  const verdaderos = booleanos.filter(Boolean).length
  const falsos = booleanos.length - verdaderos
  if (verdaderos >= 2) return true
  if (falsos >= 2) return false
  return null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch (serializationError) {
    return "Error desconocido"
  }
}
