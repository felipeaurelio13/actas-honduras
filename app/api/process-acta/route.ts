import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Convert file to buffer for processing
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Initialize results
    const results: any = {
      openai: null,
      google: null,
      aws: null,
      consensus: null,
      openai_error: null,
      google_error: null,
      aws_error: null,
    }

    // Process with OpenAI Vision
    try {
      if (process.env.OPENAI_API_KEY) {
        const openaiResult = await processWithOpenAI(buffer, file.name)
        results.openai = openaiResult
      } else {
        results.openai_error = "OPENAI_API_KEY no configurada"
      }
    } catch (error) {
      console.error("OpenAI processing error:", error)
      results.openai_error = error instanceof Error ? error.message : "Error desconocido"
    }

    // Process with Google Document AI
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.DOC_AI_PROJECT) {
        const googleResult = await processWithGoogle(buffer, file.name)
        results.google = googleResult
      } else {
        results.google_error = "Credenciales de Google Document AI no configuradas"
      }
    } catch (error) {
      console.error("Google processing error:", error)
      results.google_error = error instanceof Error ? error.message : "Error desconocido"
    }

    // Process with AWS Textract
    try {
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        const awsResult = await processWithAWS(buffer, file.name)
        results.aws = awsResult
      } else {
        results.aws_error = "Credenciales de AWS no configuradas"
      }
    } catch (error) {
      console.error("AWS processing error:", error)
      results.aws_error = error instanceof Error ? error.message : "Error desconocido"
    }

    // Generate consensus if we have at least 2 successful results
    const successfulResults = [results.openai, results.google, results.aws].filter((r) => r !== null)
    if (successfulResults.length >= 2) {
      results.consensus = generateConsensus(results.openai, results.google, results.aws)
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error("Processing error:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

async function processWithOpenAI(buffer: Buffer, filename: string) {
  const OpenAI = require("openai")
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const base64Image = buffer.toString("base64")

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Eres un experto transcriptor de actas electorales hondureñas (Acta de Cierre, nivel Diputados). 
            Extrae EXACTAMENTE el texto que ves (no adivines). 
            Devuelve un JSON con la estructura:
            {
              "header": {
                "departamento": "string o null",
                "municipio": "string o null", 
                "centro_votacion": "string o null",
                "jrv": "string o null",
                "codigo_acta": "string o null"
              },
              "resultados": {
                "partidos": [{"nombre": "string", "votos": number}],
                "totales": {
                  "validos": number,
                  "nulos": number, 
                  "blancos": number,
                  "total_sumado": number
                }
              }
            }
            Si no puedes leer un campo claramente, usa null. No inventes valores.`,
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
    max_tokens: 1000,
  })

  const content = response.choices[0].message.content
  let parsedResult

  try {
    parsedResult = JSON.parse(content)
  } catch {
    // If JSON parsing fails, create a basic structure
    parsedResult = {
      header: { departamento: null, municipio: null, centro_votacion: null, jrv: null, codigo_acta: null },
      resultados: { partidos: [], totales: { validos: null, nulos: null, blancos: null, total_sumado: null } },
    }
  }

  return {
    meta: {
      nivel: "Diputados",
      pais: "Honduras",
      fuente: filename,
      timestamp_procesamiento: new Date().toISOString(),
      version_schema: "1.1.0",
      agente: "OPENAI",
      confianza_global: 0.85,
    },
    header: parsedResult.header,
    resultados: parsedResult.resultados,
    verificaciones: {
      suma_partidos_igual_validos: null,
      suma_global_coherente: null,
      campos_firma_presentes: null,
    },
    observaciones: null,
  }
}

async function processWithGoogle(buffer: Buffer, filename: string) {
  // Placeholder for Google Document AI processing
  // In a real implementation, you would use the Google Cloud Document AI client
  return {
    meta: {
      nivel: "Diputados",
      pais: "Honduras",
      fuente: filename,
      timestamp_procesamiento: new Date().toISOString(),
      version_schema: "1.1.0",
      agente: "GCP_DOC_AI",
      confianza_global: 0.8,
    },
    header: { departamento: null, municipio: null, centro_votacion: null, jrv: null, codigo_acta: null },
    resultados: { partidos: [], totales: { validos: null, nulos: null, blancos: null, total_sumado: null } },
    verificaciones: {
      suma_partidos_igual_validos: null,
      suma_global_coherente: null,
      campos_firma_presentes: null,
    },
    observaciones: "Servicio Google Document AI no implementado completamente",
  }
}

async function processWithAWS(buffer: Buffer, filename: string) {
  // Placeholder for AWS Textract processing
  // In a real implementation, you would use the AWS SDK for Textract
  return {
    meta: {
      nivel: "Diputados",
      pais: "Honduras",
      fuente: filename,
      timestamp_procesamiento: new Date().toISOString(),
      version_schema: "1.1.0",
      agente: "AWS_TEXTRACT",
      confianza_global: 0.75,
    },
    header: { departamento: null, municipio: null, centro_votacion: null, jrv: null, codigo_acta: null },
    resultados: { partidos: [], totales: { validos: null, nulos: null, blancos: null, total_sumado: null } },
    verificaciones: {
      suma_partidos_igual_validos: null,
      suma_global_coherente: null,
      campos_firma_presentes: null,
    },
    observaciones: "Servicio AWS Textract no implementado completamente",
  }
}

function generateConsensus(openai: any, google: any, aws: any) {
  const agents = [openai, google, aws].filter((a) => a !== null)

  if (agents.length < 2) return null

  // Consensus for header fields
  const header: any = {}
  const headerFields = ["departamento", "municipio", "centro_votacion", "jrv", "codigo_acta"]

  for (const field of headerFields) {
    const values = agents.map((a) => a.header?.[field]).filter((v) => v !== null && v !== undefined)
    header[field] = getMajorityValue(values)
  }

  // Consensus for parties - merge by name and take majority vote counts
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

  // Consensus for totals
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

  // Require at least 2 agents to agree
  if (maxCount >= 2) {
    const winner = entries.find(([, count]) => count === maxCount)?.[0]
    return winner || null
  }

  return null
}

function getMajorityNumber(values: number[]): number | null {
  if (values.length === 0) return null

  // For numbers, we need exact matches or very close values
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

  // Require at least 2 agents to agree
  if (maxCount >= 2) {
    const winnerGroup = entries.find(([, group]) => group.length === maxCount)?.[1]
    return winnerGroup ? Math.round(winnerGroup.reduce((a, b) => a + b, 0) / winnerGroup.length) : null
  }

  return null
}
