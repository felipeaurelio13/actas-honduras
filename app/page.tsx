"use client"

import type React from "react"
import { useState, useCallback, useMemo } from "react"
import { z } from "zod"
import { Upload, FileText, BarChart3, CheckCircle, AlertCircle, Clock, Eye, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { APP_NAME, APP_VERSION, SUPPORT_EMAIL } from "@/lib/app-info"
import {
  type ActaPayload,
  type AgentErrorKey,
  type AgentPipeline,
  type ApiResponsePayload,
  type Partido,
} from "@/lib/acta-types"

const partidoSchema: z.ZodType<Partido> = z.object({
  nombre: z.string(),
  votos: z.number().int().nullable(),
})

const totalesSchema = z.object({
  validos: z.number().int().nullable(),
  nulos: z.number().int().nullable(),
  blancos: z.number().int().nullable(),
  total_sumado: z.number().int().nullable(),
})

const verificacionesSchema = z.object({
  suma_partidos_igual_validos: z.boolean().nullable(),
  suma_global_coherente: z.boolean().nullable(),
  campos_firma_presentes: z.boolean().nullable(),
})

const actaPayloadSchema: z.ZodType<ActaPayload> = z.object({
  meta: z.object({
    nivel: z.string(),
    pais: z.string(),
    fuente: z.string(),
    timestamp_procesamiento: z.string(),
    version_schema: z.string(),
    agente: z.string(),
    confianza_global: z.number(),
  }),
  header: z.object({
    departamento: z.string().nullable(),
    municipio: z.string().nullable(),
    centro_votacion: z.string().nullable(),
    jrv: z.string().nullable(),
    codigo_acta: z.string().nullable(),
  }),
  resultados: z.object({
    partidos: z.array(partidoSchema),
    totales: totalesSchema,
    tablas_brutas: z.array(z.array(z.string())),
  }),
  verificaciones: verificacionesSchema,
  observaciones: z.string().nullable(),
})

const apiResponseSchema: z.ZodType<ApiResponsePayload> = z.object({
  openai_vision: actaPayloadSchema.nullable(),
  openai_vision_error: z.string().nullable(),
  openai_ocr: actaPayloadSchema.nullable(),
  openai_ocr_error: z.string().nullable(),
  openai_document: actaPayloadSchema.nullable(),
  openai_document_error: z.string().nullable(),
  consensus: actaPayloadSchema.nullable(),
})

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")

type AgentKey = "vision" | "ocr" | "document"

type AgentStatus = "processing" | "completed" | "error"

type ApiAgentResultKey = AgentPipeline

type ApiAgentErrorKey = AgentErrorKey

interface AgentResult {
  status: AgentStatus
  data?: ActaPayload
  error?: string
}

interface AgentSnapshot {
  key: AgentKey
  data: ActaPayload | null
  error: string | null
  success: boolean
}

type AgentsState = Record<AgentKey, AgentResult>

interface ProcessingResult {
  id: string
  filename: string
  status: "processing" | "completed" | "error"
  progress: number
  agents: AgentsState
  consensus: ActaPayload | null
  uploadedFile?: File
  debugLogs: string[]
}

const agentMetadata: Record<AgentKey, { label: string; shortLabel: string; resultKey: ApiAgentResultKey; errorKey: ApiAgentErrorKey }> = {
  vision: {
    label: "OpenAI Vision (Análisis visual)",
    shortLabel: "Visión",
    resultKey: "openai_vision",
    errorKey: "openai_vision_error",
  },
  ocr: {
    label: "OpenAI OCR (Reconocimiento de texto)",
    shortLabel: "OCR",
    resultKey: "openai_ocr",
    errorKey: "openai_ocr_error",
  },
  document: {
    label: "OpenAI Document (Comprensión estructural)",
    shortLabel: "Documento",
    resultKey: "openai_document",
    errorKey: "openai_document_error",
  },
}

const agentOrder: AgentKey[] = ["vision", "ocr", "document"]

const createInitialAgentsState = (): AgentsState => ({
  vision: { status: "processing" },
  ocr: { status: "processing" },
  document: { status: "processing" },
})

export default function HomePage() {
  const [files, setFiles] = useState<ProcessingResult[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<ProcessingResult | null>(null)

  const consensusMetrics = useMemo(() => {
    if (!selectedFile?.consensus) {
      return { parties: [] as Partido[], sortedParties: [] as Partido[], totalVotes: 0 }
    }
    const parties = selectedFile.consensus.resultados.partidos
    const totalVotes = parties.reduce((sum, partido) => sum + (partido.votos ?? 0), 0)
    const sortedParties = [...parties].sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0))
    return { parties, sortedParties, totalVotes }
  }, [selectedFile])

  const addDebugLog = useCallback((fileId: string, message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              debugLogs: [...f.debugLogs, `[${timestamp}] ${message}`],
            }
          : f,
      ),
    )
  }, [])

  const processWithAI = useCallback(
    async (fileId: string, file: File) => {
      try {
        addDebugLog(fileId, "📤 Preparando archivo para envío...")
        const formData = new FormData()
        formData.append("file", file)

        setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: 10 } : f)))
        addDebugLog(fileId, "🔄 Enviando a 3 agentes OpenAI en paralelo...")

        const endpoint = `${API_BASE_URL}/api/process-acta`
        const response = await fetch(endpoint, {
          method: "POST",
          body: formData,
        })

        addDebugLog(fileId, `📡 Respuesta del servidor: ${response.status} ${response.statusText}`)

        if (!response.ok) {
          const errorText = await response.text()
          addDebugLog(fileId, `❌ Error HTTP: ${errorText}`)
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
        }

        const result = apiResponseSchema.parse(await response.json())
        addDebugLog(fileId, `📊 Datos recibidos: ${JSON.stringify(Object.keys(result))}`)

        const agentSnapshots: AgentSnapshot[] = agentOrder.map((key) => {
          const meta = agentMetadata[key]
          const agentData = result[meta.resultKey]
          const agentError = result[meta.errorKey]
          const success = Boolean(agentData) && !agentError

          addDebugLog(fileId, `🤖 ${meta.label}: ${success ? "✅ Éxito" : "❌ Error"}`)
          if (agentError) {
            addDebugLog(fileId, `❌ Detalle ${meta.shortLabel}: ${agentError}`)
          }

          return {
            key,
            data: agentData,
            error: agentError,
            success,
          }
        })

        const consensusPayload = result.consensus
        if (consensusPayload) {
          const partidosCount = consensusPayload.resultados.partidos.length
          const totalVotos = consensusPayload.resultados.partidos.reduce(
            (sum, partido) => sum + (partido.votos ?? 0),
            0,
          )
          addDebugLog(fileId, `🎯 Consenso generado: ${partidosCount} partidos, ${totalVotos} votos totales`)
        } else {
          addDebugLog(fileId, "⚠️ No se pudo generar consenso (menos de 2 agentes exitosos)")
        }

        const hasSuccess = agentSnapshots.some((snapshot) => snapshot.success)

        setFiles((prev) =>
          prev.map((f) => {
            if (f.id !== fileId) return f

            const agents: AgentsState = { ...f.agents }
            agentSnapshots.forEach((snapshot) => {
              agents[snapshot.key] = {
                status: snapshot.success ? "completed" : "error",
                data: snapshot.data ?? undefined,
                error: snapshot.error ?? undefined,
              }
            })

            return {
              ...f,
              status: hasSuccess ? "completed" : "error",
              progress: hasSuccess ? 100 : 0,
              agents,
              consensus: result.consensus,
            }
          }),
        )

        addDebugLog(fileId, "✅ Procesamiento completado exitosamente")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido"
        const stackSnippet = error instanceof Error && error.stack ? error.stack.substring(0, 200) : null
        console.error("Error processing file:", error)
        addDebugLog(fileId, `💥 Error crítico: ${message}`)
        if (stackSnippet) {
          addDebugLog(fileId, `🔍 Stack trace: ${stackSnippet}...`)
        }

        setFiles((prev) =>
          prev.map((f) => {
            if (f.id !== fileId) return f

            const agents: AgentsState = { ...f.agents }
            agentOrder.forEach((key) => {
              agents[key] = { status: "error", error: message }
            })

            return {
              ...f,
              status: "error",
              progress: 0,
              consensus: null,
              agents,
            }
          }),
        )
      }
    },
    [addDebugLog],
  )

  const processFiles = useCallback(
    async (fileList: File[]) => {
      for (const file of fileList) {
        const newFile: ProcessingResult = {
          id: Math.random().toString(36).slice(2, 11),
          filename: file.name,
          status: "processing",
          progress: 0,
          uploadedFile: file,
          debugLogs: [],
          consensus: null,
          agents: createInitialAgentsState(),
        }

        setFiles((prev) => [...prev, newFile])
        addDebugLog(newFile.id, `🚀 Iniciando procesamiento de ${file.name} (${(file.size / 1024).toFixed(1)}KB)`)
        await processWithAI(newFile.id, file)
      }
    },
    [addDebugLog, processWithAI],
  )

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (file) => file.type.startsWith("image/") || file.type === "application/pdf",
      )
      void processFiles(droppedFiles)
    },
    [processFiles],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selectedFiles = Array.from(e.target.files)
        void processFiles(selectedFiles)
      }
    },
    [processFiles],
  )

  const getAgentStatusIcon = (status: AgentStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />
      default:
        return <Clock className="w-4 h-4 text-accent" />
    }
  }

  const downloadResult = (fileId: string, target: AgentKey | "consensus") => {
    const file = files.find((f) => f.id === fileId)
    if (!file) return

    const data =
      target === "consensus"
        ? file.consensus
        : file.agents[target]?.data

    if (!data) return

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const suffix =
      target === "consensus"
        ? "CONSENSO"
        : agentMetadata[target].resultKey.toUpperCase()
    a.download = `${file.filename}.${suffix}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const totalVotes = useMemo(() => {
    return files.reduce<Record<string, number>>((acc, file) => {
      if (!file.consensus) {
        return acc
      }
      file.consensus.resultados.partidos.forEach((partido) => {
        if (typeof partido.votos === "number") {
          acc[partido.nombre] = (acc[partido.nombre] ?? 0) + partido.votos
        }
      })
      return acc
    }, {})
  }, [files])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">{APP_NAME}</h1>
              <p className="text-muted-foreground font-[family-name:var(--font-dm-sans)]">
                Procesamiento paralelo con 3 agentes especializados de OpenAI para llegar a un consenso confiable.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Subir Actas
            </TabsTrigger>
            <TabsTrigger value="processing" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Procesamiento
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-space-grotesk)]">Subir Actas de Diputados</CardTitle>
                <CardDescription className="font-[family-name:var(--font-dm-sans)]">
                  Sube imágenes de actas electorales para procesamiento automático y consenso con agentes de OpenAI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2 font-[family-name:var(--font-space-grotesk)]">
                    Subir Actas Electorales
                  </h3>
                  <p className="text-muted-foreground mb-4 font-[family-name:var(--font-dm-sans)]">
                    Formatos: JPG, PNG, PDF • Resolución recomendada: ≥300 DPI
                  </p>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button asChild>
                    <label htmlFor="file-upload" className="cursor-pointer">
                      Seleccionar Archivos
                    </label>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="processing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-space-grotesk)]">Estado del Procesamiento</CardTitle>
                <CardDescription className="font-[family-name:var(--font-dm-sans)]">
                  Seguimiento del análisis por 3 agentes OpenAI especializados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {files.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground font-[family-name:var(--font-dm-sans)]">
                    No hay archivos en procesamiento
                  </div>
                ) : (
                  files.map((file) => (
                    <div key={file.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {file.status === "processing" && <Clock className="w-5 h-5 text-accent" />}
                            {file.status === "completed" && <CheckCircle className="w-5 h-5 text-green-600" />}
                            {file.status === "error" && <AlertCircle className="w-5 h-5 text-destructive" />}
                          </div>
                          <div>
                            <p className="font-medium font-[family-name:var(--font-dm-sans)]">{file.filename}</p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {agentOrder.map((agentKey) => {
                                const agent = file.agents[agentKey]
                                const meta = agentMetadata[agentKey]
                                return (
                                  <div key={agentKey} className="flex items-center gap-1">
                                    {getAgentStatusIcon(agent.status)}
                                    <span className="text-xs">{meta.shortLabel}</span>
                                    {agent.error && (
                                      <span className="text-xs text-destructive ml-1">({agent.error.substring(0, 20)}...)</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {file.status === "completed" && (
                            <Button variant="outline" size="sm" onClick={() => setSelectedFile(file)}>
                              <Eye className="w-4 h-4 mr-1" />
                              Ver Resultados
                            </Button>
                          )}
                          <Badge variant={file.status === "completed" ? "default" : "secondary"}>
                            {file.status === "processing" && "Procesando"}
                            {file.status === "completed" && "Completado"}
                            {file.status === "error" && "Error"}
                          </Badge>
                        </div>
                      </div>
                      {file.status === "processing" && <Progress value={file.progress} className="w-full" />}
                      {file.status === "completed" && (
                        <div className="flex items-center gap-2 text-sm">
                          {file.consensus ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              ✓ Consenso Generado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              ⚠ Sin Consenso (≤1 agente exitoso)
                            </Badge>
                          )}
                          <span className="text-muted-foreground">
                            Agentes exitosos:{" "}
                            {
                              agentOrder.filter((agentKey) => file.agents[agentKey].status === "completed").length
                            }
                            /3
                          </span>
                        </div>
                      )}

                      {file.debugLogs && file.debugLogs.length > 0 && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <h4 className="text-sm font-medium mb-2">🔍 Debug Log:</h4>
                          <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                            {file.debugLogs.slice(-10).map((log, index) => (
                              <div key={index} className="font-mono text-muted-foreground">
                                {log}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {selectedFile && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-space-grotesk)]">
                    Resultados Detallados: {selectedFile.filename}
                  </CardTitle>
                  <CardDescription className="font-[family-name:var(--font-dm-sans)]">
                    Comparación de resultados por agente y consenso final - Solo datos reales extraídos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {agentOrder.map((agentKey) => {
                      const agent = selectedFile.agents[agentKey]
                      const meta = agentMetadata[agentKey]
                      const partidos = Array.isArray(agent.data?.resultados?.partidos)
                        ? agent.data.resultados.partidos
                        : []
                      const totalVotos = partidos.reduce((sum, partido) => sum + (partido.votos ?? 0), 0)

                      let content
                      if (agent.status === "completed") {
                        content = (
                          <div className="text-xs space-y-1">
                            <p>
                              <strong>Depto:</strong> {agent.data?.header?.departamento || "No detectado"}
                            </p>
                            <p>
                              <strong>Municipio:</strong> {agent.data?.header?.municipio || "No detectado"}
                            </p>
                            <p>
                              <strong>JRV:</strong> {agent.data?.header?.jrv || "No detectado"}
                            </p>
                            <p>
                              <strong>Partidos:</strong> {partidos.length}
                            </p>
                            <p>
                              <strong>Total Votos:</strong> {totalVotos}
                            </p>
                          </div>
                        )
                      } else if (agent.status === "processing") {
                        content = <p className="text-xs text-muted-foreground">Procesando datos...</p>
                      } else {
                        content = (
                          <div className="text-xs">
                            <p className="text-destructive font-medium">Error:</p>
                            <p className="text-destructive">{agent.error || "Error desconocido"}</p>
                          </div>
                        )
                      }

                      return (
                        <div key={agentKey} className="border rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-sm">{meta.label}</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadResult(selectedFile.id, agentKey)}
                              disabled={!agent.data}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                          {content}
                        </div>
                      )
                    })}

                    {/* Consensus Results */}
                    <div className="border rounded p-3 bg-primary/5">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm">CONSENSO FINAL</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadResult(selectedFile.id, "consensus")}
                          disabled={!selectedFile.consensus}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                      {selectedFile.consensus ? (
                        <div className="text-xs space-y-1">
                          <p>
                            <strong>Depto:</strong> {selectedFile.consensus.header?.departamento || "No consenso"}
                          </p>
                          <p>
                            <strong>Municipio:</strong> {selectedFile.consensus.header?.municipio || "No consenso"}
                          </p>
                          <p>
                            <strong>JRV:</strong> {selectedFile.consensus.header?.jrv || "No consenso"}
                          </p>
                          <p>
                            <strong>Partidos:</strong> {consensusMetrics.parties.length}
                          </p>
                          <p className="font-medium text-primary">
                            <strong>Total Votos:</strong> {consensusMetrics.totalVotes}
                          </p>
                          <p className="text-green-600 font-medium">✓ Validado por ≥2 agentes</p>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <p className="text-muted-foreground font-medium">Sin consenso disponible</p>
                          <p className="text-muted-foreground">Se requieren ≥2 agentes exitosos</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedFile.consensus && consensusMetrics.parties.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium mb-2">Desglose por Partido (Consenso)</h5>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2">Partido</th>
                              <th className="text-right p-2">Votos</th>
                              <th className="text-right p-2">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {consensusMetrics.sortedParties.map((partido, index) => {
                              const percentage =
                                consensusMetrics.totalVotes > 0
                                  ? (((partido.votos ?? 0) / consensusMetrics.totalVotes) * 100).toFixed(1)
                                  : "0.0"
                              return (
                                <tr key={index} className="border-t">
                                  <td className="p-2 font-medium">{partido.nombre}</td>
                                  <td className="p-2 text-right font-mono">
                                    {(partido.votos ?? 0).toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right text-muted-foreground">{percentage}%</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <Button variant="outline" onClick={() => setSelectedFile(null)} className="w-full">
                    Cerrar Detalles
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium font-[family-name:var(--font-space-grotesk)]">
                    Actas Procesadas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {files.filter((f) => f.status === "completed").length}
                  </div>
                  <p className="text-xs text-muted-foreground">de {files.length} total</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium font-[family-name:var(--font-space-grotesk)]">
                    Total Votos (Consenso)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {Object.values(totalVotes)
                      .reduce((a, b) => a + b, 0)
                      .toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">votos validados</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium font-[family-name:var(--font-space-grotesk)]">
                    Agentes Activos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">3</div>
                  <p className="text-xs text-muted-foreground">OpenAI Vision • OpenAI OCR • OpenAI Document</p>
                </CardContent>
              </Card>
            </div>

            {Object.keys(totalVotes).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-space-grotesk)]">
                    Resultados por Partido (Solo Consenso)
                  </CardTitle>
                  <CardDescription className="font-[family-name:var(--font-dm-sans)]">
                    Conteo acumulado basado únicamente en datos de consenso validados por ≥2 agentes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(totalVotes)
                      .sort(([, a], [, b]) => b - a)
                      .map(([partido, votos]) => {
                        const total = Object.values(totalVotes).reduce((a, b) => a + b, 0)
                        const percentage = total > 0 ? (votos / total) * 100 : 0
                        return (
                          <div key={partido} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-medium font-[family-name:var(--font-dm-sans)]">{partido}</span>
                              <div className="text-right">
                                <span className="font-bold text-primary">{votos.toLocaleString()}</span>
                                <span className="text-sm text-muted-foreground ml-2">({percentage.toFixed(1)}%)</span>
                              </div>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        )
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <footer className="border-t bg-card">
        <div className="container mx-auto px-4 py-4 text-xs text-muted-foreground flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <span className="font-[family-name:var(--font-dm-sans)] text-foreground/80">{APP_NAME}</span>
          <span className="font-mono">Versión {APP_VERSION}</span>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="hover:text-foreground transition-colors"
          >
            Soporte: {SUPPORT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  )
}
