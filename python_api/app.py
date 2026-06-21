from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from markitdown import MarkItDown

app = FastAPI(title='MyTools MarkItDown API', version='1.0.0')

# Keep CORS permissive for local development; tighten this if exposed publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

md = MarkItDown(enable_plugins=False)


@app.get('/api/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/api/supported-types')
def supported_types() -> dict[str, list[str]]:
    return {
        'types': [
            '.pdf',
            '.pptx',
            '.docx',
            '.xlsx',
            '.xls',
            '.csv',
            '.html',
            '.htm',
            '.xml',
            '.json',
            '.txt',
            '.md',
            '.jpg',
            '.jpeg',
            '.png',
            '.wav',
            '.mp3',
            '.zip',
            '.epub',
        ]
    }


@app.post('/api/convert')
async def convert(file: UploadFile = File(...)) -> dict[str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail='缺少檔名。')

    suffix = Path(file.filename).suffix
    temp_path = ''

    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        # convert_local is safer than convert for server-side file handling.
        result = md.convert_local(temp_path)
        markdown = getattr(result, 'text_content', None) or getattr(result, 'markdown', None)

        if not isinstance(markdown, str) or markdown.strip() == '':
            raise HTTPException(status_code=500, detail='MarkItDown 回傳空內容。')

        return {
            'fileName': file.filename,
            'markdown': markdown,
            'engine': 'markitdown-python',
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f'無法轉換此檔案：{exc}') from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
