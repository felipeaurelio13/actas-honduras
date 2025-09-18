"use client"

import type React from "react"

import { useState } from "react"
import { Upload, FileText, BarChart3, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface ProcessingResult {
  id: string
  filename: string
  status: "processing" | "completed" | "error"
  progress: number
  results?: {
    mesa: string
    departamento: string
    municipio: string
    votos: { [partido: string]: number }
    consensus: number
  }
}

export default function HomePage() {
  const [files, setFiles] = useState<ProcessingResult[]>([])
  const [dragActive, setDragActive] = useState(false)

  console.log("[v0] HomePage component loaded successfully")

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    processFiles(droppedFiles)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      processFiles(selectedFiles)
    }
  }

  const processFiles = (fileList: File[]) => {
    fileList.forEach((file) => {
      const newFile: ProcessingResult = {
        id: Math.random().toString(36).substr(2, 9),
        filename: file.name,
        status: "processing",
        progress: 0,
      }

      setFiles((prev) => [...prev, newFile])

      // Simulate processing
      simulateProcessing(newFile.id)
    })
  }

  const simulateProcessing = (fileId: string) => {
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 20

      setFiles((prev) =>
        prev.map((file) => (file.id === fileId ? { ...file, progress: Math.min(progress, 100) } : file)),
      )

      if (progress >= 100) {
        clearInterval(interval)
        // Simulate completion with mock results
        setTimeout(() => {
          setFiles((prev) =>
            prev.map((file) =>
              file.id === fileId
                ? {
                    ...file,
                    status: "completed",
                    results: {
                      mesa: `Mesa ${Math.floor(Math.random() * 1000) + 1}`,
                      departamento: "Francisco Morazán",
                      municipio: "Tegucigalpa",
                      votos: {
                        "Partido Nacional": Math.floor(Math.random() * 500) + 100,
                        "Partido Liberal": Math.floor(Math.random() * 400) + 80,
                        "Partido Libertad y Refundación": Math.floor(Math.random() * 300) + 50,
                        Otros: Math.floor(Math.random() * 100) + 10,
                      },
                      consensus: Math.floor(Math.random() * 30) + 70,
                    },
                  }
                : file,
            ),
          )
        }, 1000)
      }
    }, 500)
  }

  const totalVotes = files
    .filter((f) => f.results)
    .reduce(
      (acc, file) => {
        if (file.results) {
          Object.entries(file.results.votos).forEach(([partido, votos]) => {
            acc[partido] = (acc[partido] || 0) + votos
          })
        }
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
                Sistema de Procesamiento de Actas Electorales
              </h1>
              <p className="text-muted-foreground font-[family-name:var(--font-dm-sans)]">
                República de Honduras - Tribunal Supremo Electoral
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
              Resultados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-space-grotesk)]">Subir Actas Electorales</CardTitle>
                <CardDescription className="font-[family-name:var(--font-dm-sans)]">
                  Arrastra y suelta las imágenes de las actas o selecciona archivos para procesamiento automático
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
                    Formatos soportados: JPG, PNG, PDF
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
            {/* Processing Status */}
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-space-grotesk)]">Estado del Procesamiento</CardTitle>
                <CardDescription className="font-[family-name:var(--font-dm-sans)]">
                  Seguimiento del análisis de actas por múltiples agentes de IA
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
                            <p className="text-sm text-muted-foreground">
                              {file.status === "processing" && "Procesando con 3 agentes de IA..."}
                              {file.status === "completed" && `Consenso: ${file.results?.consensus}%`}
                              {file.status === "error" && "Error en el procesamiento"}
                            </p>
                          </div>
                        </div>
                        <Badge variant={file.status === "completed" ? "default" : "secondary"}>
                          {file.status === "processing" && "Procesando"}
                          {file.status === "completed" && "Completado"}
                          {file.status === "error" && "Error"}
                        </Badge>
                      </div>
                      {file.status === "processing" && <Progress value={file.progress} className="w-full" />}
                      {file.results && (
                        <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-muted rounded">
                          <div>
                            <p className="text-sm font-medium">Mesa: {file.results.mesa}</p>
                            <p className="text-sm text-muted-foreground">
                              {file.results.departamento}, {file.results.municipio}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">Total Votos</p>
                            <p className="text-lg font-bold text-primary">
                              {Object.values(file.results.votos).reduce((a, b) => a + b, 0)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            {/* Results Dashboard */}
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
                    Total Votos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {Object.values(totalVotes)
                      .reduce((a, b) => a + b, 0)
                      .toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">votos contabilizados</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium font-[family-name:var(--font-space-grotesk)]">
                    Consenso Promedio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {files.filter((f) => f.results).length > 0
                      ? Math.round(
                          files.filter((f) => f.results).reduce((acc, f) => acc + (f.results?.consensus || 0), 0) /
                            files.filter((f) => f.results).length,
                        )
                      : 0}
                    %
                  </div>
                  <p className="text-xs text-muted-foreground">confiabilidad</p>
                </CardContent>
              </Card>
            </div>

            {Object.keys(totalVotes).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-space-grotesk)]">Resultados por Partido</CardTitle>
                  <CardDescription className="font-[family-name:var(--font-dm-sans)]">
                    Conteo acumulado de votos procesados
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
