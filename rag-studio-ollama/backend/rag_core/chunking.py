import os
import re
from typing import List, Dict

import pypdf
from docx import Document


class DocumentChunker:
    def __init__(self, chunk_size: int = 350, chunk_overlap: int = 60):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_words = 30

    # ======================
    # PUBLIC API (НЕ МЕНЯЕМ)
    # ======================

    def chunk_document(self, file_path: str) -> List[Dict]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(file_path)

        ext = os.path.splitext(file_path)[1].lower()

        if ext == ".pdf":
            text = self._read_pdf(file_path)
        elif ext == ".docx":
            text = self._read_docx(file_path)
        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        else:
            raise ValueError(f"Unsupported format: {ext}")

        text = self._clean_text(text)

        if not text:
            return []

        # старый контракт — оставляем имя метода
        chunks = self._smart_chunking(text, file_path)

        # индекс чанка — полезно для Qdrant payload
        for i, c in enumerate(chunks):
            c.setdefault("metadata", {})
            c["metadata"]["chunk_index"] = i

        return chunks

    # ======================
    # READERS (совместимые)
    # ======================

    def _read_pdf(self, file_path: str) -> str:
        out = []
        with open(file_path, "rb") as f:
            reader = pypdf.PdfReader(f)
            for page in reader.pages:
                t = page.extract_text() or ""
                if t.strip():
                    out.append(t)
        return "\n\n".join(out)

    def _read_docx(self, file_path: str) -> str:
        doc = Document(file_path)
        parts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        return "\n".join(parts)

    # ======================
    # CLEAN (совместимый)
    # ======================

    def _clean_text(self, text: str) -> str:
        text = text.replace("\r", "\n")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    # ======================
    # SMART CHUNKING (имя сохранено)
    # ======================

    def _smart_chunking(self, text: str, file_path: str) -> List[Dict]:
        blocks = self._split_semantic_blocks(text)
        return self._build_chunks(blocks)

    # ======================
    # INTERNAL ENGINE
    # ======================

    def _split_semantic_blocks(self, text: str) -> List[str]:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        blocks = []

        for p in paragraphs:
            words = len(p.split())

            if self._looks_like_list_block(p):
                blocks.extend(self._split_list_block(p))
                continue

            if words > self.chunk_size * 1.5:
                blocks.extend(self._split_into_sentences(p))
                continue

            blocks.append(p)

        return blocks

    def _build_chunks(self, blocks: List[str]) -> List[Dict]:
        chunks = []
        current = []

        for block in blocks:
            words = block.split()

            if sum(len(x.split()) for x in current) + len(words) <= self.chunk_size:
                current.append(block)
                continue

            if current:
                chunks.append(self._create_chunk(current, "semantic"))

            overlap_words = " ".join(current).split()[-self.chunk_overlap :]
            current = [" ".join(overlap_words), block]

        if current:
            chunks.append(self._create_chunk(current, "semantic"))

        return chunks

    # ======================
    # COMPAT HELPERS
    # ======================

    def _looks_like_list_block(self, text: str) -> bool:
        lines = text.split("\n")
        if len(lines) < 3:
            return False
        hits = sum(1 for l in lines if re.match(r"^[-•*0-9]", l.strip()))
        return hits / len(lines) > 0.5

    def _split_list_block(self, text: str) -> List[str]:
        return [l.strip() for l in text.split("\n") if l.strip()]

    def _split_into_sentences(self, text: str) -> List[str]:
        sents = re.split(r"(?<=[.!?])\s+", text)
        return [s.strip() for s in sents if s.strip()]

    # ======================
    # OLD SIGNATURE — СОХРАНЕНА
    # ======================

    def _create_chunk(self, text_parts: List[str], chunk_type: str) -> Dict:
        chunk_text = "\n".join(text_parts)
        return {
            "text": chunk_text,
            "metadata": {
                "chunk_type": chunk_type,
                "words_count": len(chunk_text.split()),
                "parts_count": len(text_parts),
            },
        }

    # ======================
    # CONFIG — имя сохранено
    # ======================

    def set_chunking_params(self, chunk_size: int, chunk_overlap: int):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
