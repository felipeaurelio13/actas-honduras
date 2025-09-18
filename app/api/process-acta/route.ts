import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Starting acta processing...")

    if (!process.env.OPENAI_API_KEY) {
      console.error("[v0] Missing OPENAI_API_KEY environment variable")
      return NextResponse.json({ error: "Configuración de OpenAI faltante" }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    console.log("[v0] Processing file:", file.name, "Size:", file.size)

    // Convert file to buffer for processing
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Initialize results
    const results: any = {
      openai_vision: null,
      openai_ocr: null,
      openai_document: null,
      consensus: null,
      openai_vision_error: null,
      openai_ocr_error: null,
      openai_document_error: null,
    }

    console.log("[v0] Starting parallel processing with 3 OpenAI agents...")

    const [openaiVisionResult, openaiOCRResult, openaiDocumentResult] = await Promise.allSettled([
      processWithOpenAI(buffer, file.name, "OPENAI_VISION"),
      processWithOpenAI(buffer, file.name, "OPENAI_OCR"),
      processWithOpenAI(buffer, file.name, "OPENAI_DOCUMENT"),
    ])

    console.log("[v0] Processing results:", {
      vision: openaiVisionResult.status,
      ocr: openaiOCRResult.status,
      document: openaiDocumentResult.status,
    })

    // Handle OpenAI Vision Agent results
    if (openaiVisionResult.status === "fulfilled") {
      results.openai_vision = openaiVisionResult.value
      console.log("[v0] OpenAI Vision successful")
    } else {
      console.error("[v0] OpenAI Vision failed:", openaiVisionResult.reason)
      results.openai_vision_error = openaiVisionResult.reason?.message || "Error en agente OpenAI Vision"
    }

    // Handle OpenAI OCR Agent results
    if (openaiOCRResult.status === "fulfilled") {
      results.openai_ocr = openaiOCRResult.value
      console.log("[v0] OpenAI OCR successful")
    } else {
      console.error("[v0] OpenAI OCR failed:", openaiOCRResult.reason)
      results.openai_ocr_error = openaiOCRResult.reason?.message || "Error en agente OpenAI OCR"
    }

    // Handle OpenAI Document Agent results
    if (openaiDocumentResult.status === "fulfilled") {
      results.openai_document = openaiDocumentResult.value
      console.log("[v0] OpenAI Document successful")
    } else {
      console.error("[v0] OpenAI Document failed:", openaiDocumentResult.reason)
      results.openai_document_error = openaiDocumentResult.reason?.message || "Error en agente OpenAI Document"
    }

    // Generate consensus if we have at least 2 successful results
    const successfulResults = [results.openai_vision, results.openai_ocr, results.openai_document].filter(
      (r) => r !== null,
    )

    console.log("[v0] Successful agents:", successfulResults.length)

    if (successfulResults.length >= 2) {
      results.consensus = generateConsensus(results.openai_vision, results.openai_ocr, results.openai_document)
      console.log("[v0] Consensus generated successfully")
    } else {
      console.log("[v0] Not enough successful results for consensus")
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error("[v0] Processing error:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

async function processWithOpenAI(buffer: Buffer, filename: string, agentType = "OPENAI_VISION") {
  try {
    console.log(`[v0] Starting ${agentType} processing...`)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY no configurada")
    }

    const client = new OpenAI({ apiKey })
    const base64Image = buffer.toString("base64")

    console.log(`[v0] ${agentType} - Image converted to base64, length:`, base64Image.length)

    const prompts = {
      OPENAI_VISION: `Eres un experto transcriptor de actas electorales hondureñas para elecciones de DIPUTADOS usando análisis visual avanzado.

ENFOQUE: Análisis visual detallado de la imagen
INSTRUCCIONES CRÍTICAS:
1. Lee EXACTAMENTE lo que ves en la imagen - NO inventes ni adivines números
2. Si un número no es claramente legible, usa null
3. Busca específicamente partidos políticos hondureños como: Partido Nacional, Partido Liberal, LIBRE, PSH, etc.
4. Los votos deben ser números enteros exactos que veas en la imagen
5. Prioriza la claridad visual de los números`,

      OPENAI_OCR: `Eres un experto transcriptor de actas electorales hondureñas para elecciones de DIPUTADOS usando técnicas de OCR.

ENFOQUE: Reconocimiento óptico de caracteres y texto estructurado
INSTRUCCIONES CRÍTICAS:
1. Extrae texto de manera sistemática línea por línea
2. Identifica patrones de texto que indican nombres de partidos y números
3. Busca específicamente partidos políticos hondureños: Partido Nacional, Partido Liberal, LIBRE, PSH, etc.
4. Valida que los números extraídos sean coherentes
5. Si hay ambigüedad en OCR, usa null`,

      OPENAI_DOCUMENT: `Eres un experto transcriptor de actas electorales hondureñas para elecciones de DIPUTADOS usando análisis de documentos estructurados.

ENFOQUE: Comprensión de estructura documental y layout
INSTRUCCIONES CRÍTICAS:
1. Analiza la estructura del documento electoral hondureño
2. Identifica secciones: encabezado, tabla de partidos, totales
3. Busca específicamente partidos políticos hondureños: Partido Nacional, Partido Liberal, LIBRE, PSH, etc.
4. Valida coherencia entre sumas parciales y totales
5. Considera el formato estándar de actas electorales hondureñas`,
    }

    const selectedPrompt = prompts[agentType as keyof typeof prompts] || prompts.OPENAI_VISION

    console.log(`[v0] ${agentType} - Making OpenAI API call...`)

    const models = ["gpt-4o", "gpt-4-vision-preview", "gpt-4-turbo"]
    let response
    let lastError

    for (const model of models) {
      try {
        console.log(`[v0] ${agentType} - Trying model: ${model}`)
        response = await client.chat.completions.create({
          model: model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${selectedPrompt}\n\nEstructura JSON requerida:\n{\n  "header": {\n    "departamento": "string exacto del documento o null",\n    "municipio": "string exacto del documento o null", \n    "centro_votacion": "string exacto del documento o null",\n    "jrv": "string exacto del documento o null",\n    "codigo_acta": "string exacto del documento o null"\n  },\n  "resultados": {\n    "partidos": [\n      {"nombre": "Nombre exacto del partido", "votos": número_exacto_visible}\n    ],\n    "totales": {\n      "validos": número_total_votos_válidos,\n      "nulos": número_votos_nulos, \n      "blancos": número_votos_blancos,\n      "total_sumado": número_total_general\n    }\n  }\n}\n\nIMPORTANTE: Solo incluye partidos que realmente veas con votos claramente legibles.`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1500,
          temperature: agentType === "OPENAI_VISION" ? 0 : 0.1, // Slight variation for different agents
        })
        console.log(`[v0] ${agentType} - Success with model: ${model}`)
        break
      } catch (error: any) {
        console.error(`[v0] ${agentType} - Model ${model} failed:`, error.message)
        lastError = error
        continue
      }
    }

    if (!response) {
      throw lastError || new Error("Todos los modelos fallaron")
    }

    console.log(`[v0] ${agentType} - OpenAI API response received`)

    const content = response.choices[0].message.content
    let parsedResult

    try {
      parsedResult = JSON.parse(content || "{}")
      console.log(`[v0] ${agentType} - JSON parsed successfully`)
    } catch (parseError) {
      console.error(`[v0] ${agentType} - Failed to parse JSON:`, content)
      console.error(`[v0] ${agentType} - Parse error:`, parseError)
      parsedResult = {
        header: { departamento: null, municipio: null, centro_votacion: null, jrv: null, codigo_acta: null },
        resultados: { partidos: [], totales: { validos: null, nulos: null, blancos: null, total_sumado: null } },
      }
    }

    const validatedResult = validateAndCleanResult(parsedResult)

    const agentNames = {
      OPENAI_VISION: "OPENAI_VISION",
      OPENAI_OCR: "OPENAI_OCR",
      OPENAI_DOCUMENT: "OPENAI_DOCUMENT",
    }

    const confidenceLevels = {
      OPENAI_VISION: 0.85,
      OPENAI_OCR: 0.8,
      OPENAI_DOCUMENT: 0.82,
    }

    const result = {
      meta: {
        nivel: "Diputados",
        pais: "Honduras",
        fuente: filename,
        timestamp_procesamiento: new Date().toISOString(),
        version_schema: "1.1.0",
        agente: agentNames[agentType as keyof typeof agentNames] || "OPENAI",
        confianza_global: confidenceLevels[agentType as keyof typeof confidenceLevels] || 0.85,
      },
      header: validatedResult.header,
      resultados: validatedResult.resultados,
      verificaciones: {
        suma_partidos_igual_validos: calculateVerifications(validatedResult),
        suma_global_coherente: null,
        campos_firma_presentes: null,
      },
      observaciones: null,
    }

    console.log(`[v0] ${agentType} - Processing completed successfully`)
    return result
  } catch (error) {
    console.error(`[v0] ${agentType} - Processing failed:`, error)
    throw error
  }
}

function generateConsensus(openaiVision: any, openaiOCR: any, openaiDocument: any) {
  const agents = [openaiVision, openaiOCR, openaiDocument].filter((a) => a !== null)

  if (agents.length < 2) return null

  const header: any = {}
  const headerFields = ["departamento", "municipio", "centro_votacion", "jrv", "codigo_acta"]

  for (const field of headerFields) {
    const values = agents.map((a) => a.header?.[field]).filter((v) => v !== null && v !== undefined)
    header[field] = getMajorityValue(values)
  }

  const allParties: any = {}
  agents.forEach((agent) => {
    if (agent.resultados?.partidos) {
      agent.resultados.partidos.forEach((partido: any) => {
        const name = partido.nombre?.trim()
        if (name && typeof partido.votos === "number") {
          if (!allParties[name]) allParties[name] = []
          allParties[name].push(partido.votos)
        }
      })
    }
  })

  const partidos = Object.entries(allParties)
    .map(([nombre, votos]: [string, any]) => ({
      nombre,
      votos: getMajorityNumber(votos),
    }))
    .filter((p) => p.votos !== null)

  const totales: any = {}
  const totalFields = ["validos", "nulos", "blancos", "total_sumado"]

  for (const field of totalFields) {
    const values = agents.map((a) => a.resultados?.totales?.[field]).filter((v) => typeof v === "number")
    totales[field] = getMajorityNumber(values)
  }

  return {
    meta: {
      nivel: "Diputados",
      pais: "Honduras",
      fuente: "CONSENSO",
      timestamp_procesamiento: new Date().toISOString(),
      version_schema: "1.1.0",
      agente: "CONSENSO",
      confianza_global: 0.9,
    },
    header,
    resultados: { partidos, totales },
    verificaciones: {
      suma_partidos_igual_validos: null,
      suma_global_coherente: null,
      campos_firma_presentes: null,
    },
    observaciones: `Consenso generado de ${agents.length} agentes`,
  }
}

function getMajorityValue(values: any[]): any {
  if (values.length === 0) return null

  const counts: { [key: string]: number } = {}
  values.forEach((v) => {
    const key = String(v).trim().toUpperCase()
    counts[key] = (counts[key] || 0) + 1
  })

  const entries = Object.entries(counts)
  const maxCount = Math.max(...entries.map(([, count]) => count))

  if (maxCount >= 2) {
    const winner = entries.find(([, count]) => count === maxCount)?.[0]
    return winner || null
  }

  return null
}

function getMajorityNumber(values: number[]): number | null {
  if (values.length === 0) return null

  const tolerance = 0
  const groups: { [key: number]: number[] } = {}

  values.forEach((v) => {
    let found = false
    for (const [key, group] of Object.entries(groups)) {
      if (Math.abs(v - Number(key)) <= tolerance) {
        group.push(v)
        found = true
        break
      }
    }
    if (!found) {
      groups[v] = [v]
    }
  })

  const entries = Object.entries(groups)
  const maxCount = Math.max(...entries.map(([, group]) => group.length))

  if (maxCount >= 2) {
    const winnerGroup = entries.find(([, group]) => group.length === maxCount)?.[1]
    return winnerGroup ? Math.round(winnerGroup.reduce((a, b) => a + b, 0) / winnerGroup.length) : null
  }

  return null
}

function validateAndCleanResult(result: any) {
  const cleanHeader = {
    departamento: typeof result.header?.departamento === "string" ? result.header.departamento.trim() : null,
    municipio: typeof result.header?.municipio === "string" ? result.header.municipio.trim() : null,
    centro_votacion: typeof result.header?.centro_votacion === "string" ? result.header.centro_votacion.trim() : null,
    jrv: typeof result.header?.jrv === "string" ? result.header.jrv.trim() : null,
    codigo_acta: typeof result.header?.codigo_acta === "string" ? result.header.codigo_acta.trim() : null,
  }

  const cleanPartidos = Array.isArray(result.resultados?.partidos)
    ? result.resultados.partidos
        .filter((p: any) => p.nombre && typeof p.votos === "number" && p.votos >= 0)
        .map((p: any) => ({
          nombre: p.nombre.trim(),
          votos: Math.floor(p.votos),
        }))
    : []

  const cleanTotales = {
    validos:
      typeof result.resultados?.totales?.validos === "number" ? Math.floor(result.resultados.totales.validos) : null,
    nulos: typeof result.resultados?.totales?.nulos === "number" ? Math.floor(result.resultados.totales.nulos) : null,
    blancos:
      typeof result.resultados?.totales?.blancos === "number" ? Math.floor(result.resultados.totales.blancos) : null,
    total_sumado:
      typeof result.resultados?.totales?.total_sumado === "number"
        ? Math.floor(result.resultados.totales.total_sumado)
        : null,
  }

  return {
    header: cleanHeader,
    resultados: {
      partidos: cleanPartidos,
      totales: cleanTotales,
    },
  }
}

function calculateVerifications(data: any) {
  if (!data.resultados?.partidos || !data.resultados?.totales?.validos) {
    return null
  }

  const sumPartidos = data.resultados.partidos.reduce((sum: number, partido: any) => sum + (partido.votos || 0), 0)
  return sumPartidos === data.resultados.totales.validos
}
