import os, json
from pathlib import Path
from fastapi import FastAPI, UploadFile, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader
from dotenv import load_dotenv
import uvicorn, cv2, numpy as np
from concurrent.futures import ThreadPoolExecutor

from app.preprocess import to_canvas, deskew
from app.agents.agent_openai import run as run_openai
from app.agents.agent_google_docai import run as run_docai
from app.agents.agent_aws_textract import run as run_textract
from app.consensus import make_consensus
from app.tally import tally

load_dotenv()

BASE = Path(__file__).resolve().parent.parent
INBOX = BASE / "inbox"
OUT = BASE / "outputs"
TPL = Environment(loader=FileSystemLoader(str(BASE / "app/templates")))

# Create directories if they don't exist
INBOX.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)

app = FastAPI()
app.mount("/static", StaticFiles(directory=str(BASE/"static")), name="static")
app.mount("/outputs", StaticFiles(directory=str(OUT)), name="outputs")

def load_bgr(bytes_):
    arr = np.frombuffer(bytes_, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img

def pipeline(img_bgr, filename):
    img_bgr = to_canvas(img_bgr)
    img_bgr = deskew(img_bgr)

    with ThreadPoolExecutor(max_workers=3) as ex:
        fA = ex.submit(run_openai, img_bgr, filename)
        fB = ex.submit(run_docai, img_bgr, filename)
        fC = ex.submit(run_textract, img_bgr, filename)
        A = fA.result().model_dump()
        B = fB.result().model_dump()
        C = fC.result().model_dump()

    CONS = make_consensus(A,B,C)

    (OUT/f"{filename}.OPENAI.json").write_text(json.dumps(A,ensure_ascii=False,indent=2))
    (OUT/f"{filename}.GCP_DOC_AI.json").write_text(json.dumps(B,ensure_ascii=False,indent=2))
    (OUT/f"{filename}.AWS_TEXTRACT.json").write_text(json.dumps(C,ensure_ascii=False,indent=2))
    (OUT/f"{filename}.CONSENSO.json").write_text(json.dumps(CONS,ensure_ascii=False,indent=2))
    return A,B,C,CONS

@app.get("/", response_class=HTMLResponse)
def index():
    t = TPL.get_template("base.html")
    return t.render()

@app.post("/upload", response_class=HTMLResponse)
async def upload(request: Request, file: UploadFile):
    bytes_ = await file.read()
    (INBOX/file.filename).write_bytes(bytes_)
    A,B,C,CONS = pipeline(load_bgr(bytes_), file.filename)
    t = TPL.get_template("result.html")
    return t.render(filename=file.filename, A=A, B=B, C=C, CONS=CONS)

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard():
    totals = tally(OUT)
    t = TPL.get_template("dashboard.html")
    return t.render(items=list(totals.items()))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
