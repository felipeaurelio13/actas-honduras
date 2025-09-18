"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { Upload, FileText, BarChart3, CheckCircle, AlertCircle, Clock, Eye, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AgentResult {
  agente: string
  status: "processing" | "completed" | "error"
  data?: any
  error?: string
}

interface ProcessingResult {
  id: string
  filename: string
  status: "processing" | "completed" | "error"
  progress: number
  agents: {
    openai: AgentResult
    google: AgentResult
    aws: AgentResult
  }
  consensus?: any
  uploadedFile?: File
}

export default function HomePage() {
  const [files, setFiles] = useState<ProcessingResult[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<ProcessingResult | null>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith("image/") || file.type === "application/pdf",
    )
    processFiles(droppedFiles)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      processFiles(selectedFiles)
    }
  }, [])

  const processFiles = async (fileList: File[]) => {
    for (const file of fileList) {
      const newFile: ProcessingResult = {
        id: Math.random().toString(36).substr(2, 9),
        filename: file.name,
        status: "processing",
        progress: 0,
        uploadedFile: file,
        agents: {
          openai: { agente: "OPENAI", status: "processing" },
          google: { agente: "GCP_DOC_AI", status: "processing" },
          aws: { agente: "AWS_TEXTRACT", status: "processing" },
        },
      }

      setFiles((prev) => [...prev, newFile])
      await processWithAI(newFile.id, file)
    }
  }

  const processWithAI = async (fileId: string, file: File) => {
    try {
      const formData = new FormData()
      formData.append("file", file)

      // Update progress as agents start
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: 10 } : f)))

      // Process with all three agents in parallel
      const response = await fetch("/api/process-acta", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      // Update with real results
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "completed",
                progress: 100,
                agents: {
                  openai: {
                    agente: "OPENAI",
                    status: result.openai ? "completed" : "error",
                    data: result.openai,
                    error: result.openai_error,
                  },
                  google: {
                    agente: "GCP_DOC_AI",
                    status: result.google ? "completed" : "error",
                    data: result.google,
                    error: result.google_error,
                  },
                  aws: {
                    agente: "AWS_TEXTRACT",
                    status: result.aws ? "completed" : "error",
                    data: result.aws,
                    error: result.aws_error,
                  },
                },
                consensus: result.consensus,
              }
            : f,
        ),
      )
    } catch (error) {
      console.error("Error processing file:", error)
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "error",
                progress: 0,
                agents: {
                  openai: { agente: "OPENAI", status: "error", error: "Error de conexión" },
                  google: { agente: "GCP_DOC_AI", status: "error", error: "Error de conexión" },
                  aws: { agente: "AWS_TEXTRACT", status: "error", error: "Error de conexión" },
                },
              }
            : f,
        ),
      )
    }
  }

  const getAgentStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />
      default:
        return <Clock className="w-4 h-4 text-accent" />
    }
  }

  const downloadResult = (fileId: string, agent: string) => {
    const file = files.find((f) => f.id === fileId)
    if (!file) return

    let data
    switch (agent) {
      case "openai":
        data = file.agents.openai.data
        break
      case "google":
        data = file.agents.google.data
        break
      case "aws":
        data = file.agents.aws.data
        break
      case "consensus":
        data = file.consensus
        break
      default:
        return
    }

    if (!data) return

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${file.filename}.${agent.toUpperCase()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const totalVotes = files
    .filter((f) => f.consensus?.resultados?.partidos)
    .reduce(
      (acc, file) => {
        file.consensus.resultados.partidos.forEach((partido: any) => {
          if (typeof partido.votos === "number") {
            acc[partido.nombre] = (acc[partido.nombre] || 0) + partido.votos
          }
        })
        return acc
      },
      {} as { [partido: string]: number },
    )

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
              <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">
                Sistema ICR Actas Electorales Honduras
              </h1>
              <p className="text-muted-foreground font-[family-name:var(--font-dm-sans)]">
                Procesamiento con 3 Agentes de IA: OpenAI Vision, Google Document AI, AWS Textract
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
                  Sube imágenes de actas electorales para procesamiento automático con consenso de 3 agentes de IA
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
                  Seguimiento del análisis por OpenAI Vision, Google Document AI y AWS Textract
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
                            <div className="flex gap-2 mt-1">
                              <div className="flex items-center gap-1">
                                {getAgentStatusIcon(file.agents.openai.status)}
                                <span className="text-xs">OpenAI</span>
                                {file.agents.openai.error && (
                                  <span className="text-xs text-destructive ml-1">
                                    ({file.agents.openai.error.substring(0, 20)}...)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {getAgentStatusIcon(file.agents.google.status)}
                                <span className="text-xs">Google</span>
                                {file.agents.google.error && (
                                  <span className="text-xs text-destructive ml-1">
                                    ({file.agents.google.error.substring(0, 20)}...)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {getAgentStatusIcon(file.agents.aws.status)}
                                <span className="text-xs">AWS</span>
                                {file.agents.aws.error && (
                                  <span className="text-xs text-destructive ml-1">
                                    ({file.agents.aws.error.substring(0, 20)}...)
                                  </span>
                                )}
                              </div>
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
                              [file.agents.openai, file.agents.google, file.agents.aws].filter(
                                (a) => a.status === "completed",
                              ).length
                            }
                            /3
                          </span>
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
                    {/* OpenAI Results */}
                    <div className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm">OpenAI Vision</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadResult(selectedFile.id, "openai")}
                          disabled={!selectedFile.agents.openai.data}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                      {selectedFile.agents.openai.status === "completed" ? (
                        <div className="text-xs space-y-1">
                          <p>
                            <strong>Depto:</strong>{" "}
                            {selectedFile.agents.openai.data?.header?.departamento || "No detectado"}
                          </p>
                          <p>
                            <strong>Municipio:</strong>{" "}
                            {selectedFile.agents.openai.data?.header?.municipio || "No detectado"}
                          </p>
                          <p>
                            <strong>JRV:</strong> {selectedFile.agents.openai.data?.header?.jrv || "No detectado"}
                          </p>
                          <p>
                            <strong>Partidos:</strong>{" "}
                            {selectedFile.agents.openai.data?.resultados?.partidos?.length || 0}
                          </p>
                          <p>
                            <strong>Total Votos:</strong>{" "}
                            {selectedFile.agents.openai.data?.resultados?.partidos?.reduce(
                              (sum: number, p: any) => sum + (p.votos || 0),
                              0,
                            ) || 0}
                          </p>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <p className="text-destructive font-medium">Error:</p>
                          <p className="text-destructive">{selectedFile.agents.openai.error || "Error desconocido"}</p>
                        </div>
                      )}
                    </div>

                    {/* Google Results */}
                    <div className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm">Google DocAI</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadResult(selectedFile.id, "google")}
                          disabled={!selectedFile.agents.google.data}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                      {selectedFile.agents.google.status === "completed" ? (
                        <div className="text-xs space-y-1">
                          <p>
                            <strong>Depto:</strong>{" "}
                            {selectedFile.agents.google.data?.header?.departamento || "No detectado"}
                          </p>
                          <p>
                            <strong>Municipio:</strong>{" "}
                            {selectedFile.agents.google.data?.header?.municipio || "No detectado"}
                          </p>
                          <p>
                            <strong>JRV:</strong> {selectedFile.agents.google.data?.header?.jrv || "No detectado"}
                          </p>
                          <p>
                            <strong>Partidos:</strong>{" "}
                            {selectedFile.agents.google.data?.resultados?.partidos?.length || 0}
                          </p>
                          <p>
                            <strong>Total Votos:</strong>{" "}
                            {selectedFile.agents.google.data?.resultados?.partidos?.reduce(
                              (sum: number, p: any) => sum + (p.votos || 0),
                              0,
                            ) || 0}
                          </p>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <p className="text-destructive font-medium">Error:</p>
                          <p className="text-destructive">{selectedFile.agents.google.error || "Error desconocido"}</p>
                        </div>
                      )}
                    </div>

                    {/* AWS Results */}
                    <div className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm">AWS Textract</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadResult(selectedFile.id, "aws")}
                          disabled={!selectedFile.agents.aws.data}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                      {selectedFile.agents.aws.status === "completed" ? (
                        <div className="text-xs space-y-1">
                          <p>
                            <strong>Depto:</strong>{" "}
                            {selectedFile.agents.aws.data?.header?.departamento || "No detectado"}
                          </p>
                          <p>
                            <strong>Municipio:</strong>{" "}
                            {selectedFile.agents.aws.data?.header?.municipio || "No detectado"}
                          </p>
                          <p>
                            <strong>JRV:</strong> {selectedFile.agents.aws.data?.header?.jrv || "No detectado"}
                          </p>
                          <p>
                            <strong>Partidos:</strong> {selectedFile.agents.aws.data?.resultados?.partidos?.length || 0}
                          </p>
                          <p>
                            <strong>Total Votos:</strong>{" "}
                            {selectedFile.agents.aws.data?.resultados?.partidos?.reduce(
                              (sum: number, p: any) => sum + (p.votos || 0),
                              0,
                            ) || 0}
                          </p>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <p className="text-destructive font-medium">Error:</p>
                          <p className="text-destructive">{selectedFile.agents.aws.error || "Error desconocido"}</p>
                        </div>
                      )}
                    </div>

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
                            <strong>Partidos:</strong> {selectedFile.consensus.resultados?.partidos?.length || 0}
                          </p>
                          <p className="font-medium text-primary">
                            <strong>Total Votos:</strong>{" "}
                            {selectedFile.consensus.resultados?.partidos?.reduce(
                              (sum: number, p: any) => sum + (typeof p.votos === "number" ? p.votos : 0),
                              0,
                            ) || 0}
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

                  {selectedFile.consensus && selectedFile.consensus.resultados?.partidos?.length > 0 && (
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
                            {selectedFile.consensus.resultados.partidos
                              .sort((a: any, b: any) => (b.votos || 0) - (a.votos || 0))
                              .map((partido: any, index: number) => {
                                const totalVotos = selectedFile.consensus.resultados.partidos.reduce(
                                  (sum: number, p: any) => sum + (p.votos || 0),
                                  0,
                                )
                                const percentage =
                                  totalVotos > 0 ? (((partido.votos || 0) / totalVotos) * 100).toFixed(1) : "0.0"
                                return (
                                  <tr key={index} className="border-t">
                                    <td className="p-2 font-medium">{partido.nombre}</td>
                                    <td className="p-2 text-right font-mono">
                                      {(partido.votos || 0).toLocaleString()}
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
                  <p className="text-xs text-muted-foreground">OpenAI • Google • AWS</p>
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
    </div>
  )
}
