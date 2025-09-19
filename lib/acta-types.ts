export const AGENT_PIPELINES = ["openai_vision", "openai_ocr", "openai_document"] as const

export type AgentPipeline = (typeof AGENT_PIPELINES)[number]
export type AgentErrorKey = `${AgentPipeline}_error`

export type NullableString = string | null

export interface Header {
  departamento: NullableString
  municipio: NullableString
  centro_votacion: NullableString
  jrv: NullableString
  codigo_acta: NullableString
}

export interface Totales {
  validos: number | null
  nulos: number | null
  blancos: number | null
  total_sumado: number | null
}

export interface Partido {
  nombre: string
  votos: number | null
}

export interface LimpiadorActa {
  header: Header
  resultados: {
    partidos: Partido[]
    totales: Totales
    tablas_brutas: string[][]
  }
}

export interface Verificaciones {
  suma_partidos_igual_validos: boolean | null
  suma_global_coherente: boolean | null
  campos_firma_presentes: boolean | null
}

export interface ActaMeta {
  nivel: string
  pais: string
  fuente: string
  timestamp_procesamiento: string
  version_schema: string
  agente: string
  confianza_global: number
}

export interface ActaPayload {
  meta: ActaMeta
  header: Header
  resultados: {
    partidos: Partido[]
    totales: Totales
    tablas_brutas: string[][]
  }
  verificaciones: Verificaciones
  observaciones: string | null
}

export type ApiResponsePayload = Record<AgentPipeline, ActaPayload | null> &
  Record<AgentErrorKey, string | null> & {
    consensus: ActaPayload | null
  }
