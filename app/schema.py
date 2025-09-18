from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Any, Dict
from datetime import datetime

class PartidoItem(BaseModel):
    nombre: str
    votos: Optional[int] = None
    confianza: float = 0.0

class Totales(BaseModel):
    validos: Optional[int] = None
    nulos: Optional[int] = None
    blancos: Optional[int] = None
    total_sumado: Optional[int] = None

class Verificaciones(BaseModel):
    suma_partidos_igual_validos: Optional[Literal[True, False]] = None
    suma_global_coherente: Optional[Literal[True, False]] = None
    campos_firma_presentes: Optional[Literal[True, False]] = None

class Header(BaseModel):
    departamento: Optional[str] = None
    municipio: Optional[str] = None
    centro_votacion: Optional[str] = None
    jrv: Optional[str] = None
    codigo_acta: Optional[str] = None

class Meta(BaseModel):
    nivel: str = "Diputados"
    pais: str = "Honduras"
    fuente: str
    timestamp_procesamiento: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    version_schema: str = "1.1.1"
    agente: str
    confianza_global: float = 0.0

class ActaJSON(BaseModel):
    meta: Meta
    header: Header
    resultados: Dict[str, Any]
    verificaciones: Verificaciones
    observaciones: Optional[str] = None
