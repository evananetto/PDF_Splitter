# split_pdf.py

import re
from pathlib import Path
import fitz  # PyMuPDF
import pikepdf
import zipfile
import uuid

def parse_page_range(range_str: str, total_pages: int) -> list[int]:
    """
    Parses range strings like '1-5, 6-10', '1 & 5', 'even', 'odd' into 0-indexed page indices.
    Input range numbers are 1-indexed.
    Supports reverse ranges like '5-1' to maintain order.
    """
    range_str = range_str.strip().lower()
    if not range_str:
        return list(range(total_pages))
        
    if range_str == "even":
        return [i for i in range(total_pages) if (i + 1) % 2 == 0]
    if range_str == "odd":
        return [i for i in range(total_pages) if (i + 1) % 2 != 0]

    pages = []
    # Support & and ; as separators
    normalized = range_str.replace("&", ",").replace(";", ",")
    chunks = [c.strip() for c in normalized.split(",") if c.strip()]

    for chunk in chunks:
        if "-" in chunk:
            # Support both forward (1-5) and reverse (5-1) ranges
            m = re.match(r"^(\d+)\s*-\s*(\d+)$", chunk)
            if m:
                start, end = int(m.group(1)), int(m.group(2))
                # Clamp to valid page range
                start = max(1, min(start, total_pages))
                end = max(1, min(end, total_pages))
                if start <= end:
                    # Forward range: 1-5
                    pages.extend(range(start - 1, end))
                else:
                    # Reverse range: 5-1 (preserve order)
                    pages.extend(range(start - 1, end - 2, -1))
        elif chunk.isdigit():
            val = int(chunk)
            if 1 <= val <= total_pages:
                pages.append(val - 1)

    # Remove duplicates while preserving order
    seen = set()
    deduped = []
    for p in pages:
        if p not in seen:
            seen.add(p)
            deduped.append(p)
    return deduped

def render_thumbnail(pdf_path: Path, page_num: int, target_width: int = 300) -> bytes:
    """Renders a single PDF page as JPEG image bytes for visual grid thumbnails."""
    doc = fitz.open(pdf_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        raise ValueError(f"Page {page_num} out of bounds (1..{len(doc)})")
        
    page = doc[page_num - 1]
    zoom = target_width / page.rect.width if page.rect.width > 0 else 1.0
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    img_bytes = pix.tobytes("jpeg")
    doc.close()
    return img_bytes

def get_pdf_page_count(pdf_path: Path) -> int:
    """Returns total page count of PDF."""
    doc = fitz.open(pdf_path)
    count = len(doc)
    doc.close()
    return count

def split_pdf_by_range(input_pdf: Path, output_pdf: Path, range_str: str) -> dict:
    """Splits PDF by custom range string using pikepdf zero-copy stream extraction."""
    with pikepdf.Pdf.open(input_pdf) as src:
        total = len(src.pages)
        indices = parse_page_range(range_str, total)
        if not indices:
            raise ValueError("No valid pages found in specified page range.")
            
        dst = pikepdf.Pdf.new()
        for idx in indices:
            dst.pages.append(src.pages[idx])
        dst.save(output_pdf)
        dst.close()
        
    return {
        "extracted_pages": len(indices),
        "total_pages": total,
        "output_filename": output_pdf.name
    }

def split_pdf_every_n_pages(input_pdf: Path, output_dir: Path, n: int) -> list[Path]:
    """
    Splits PDF into multiple files, each containing at most N pages.
    Returns list of created file paths.
    """
    if n <= 0:
        raise ValueError("N must be a positive integer greater than 0.")
        
    created = []
    with pikepdf.Pdf.open(input_pdf) as src:
        total = len(src.pages)
        part = 1
        for start_idx in range(0, total, n):
            end_idx = min(start_idx + n, total)
            dst = pikepdf.Pdf.new()
            for idx in range(start_idx, end_idx):
                dst.pages.append(src.pages[idx])
            out_file = output_dir / f"{input_pdf.stem}_part_{part}.pdf"
            dst.save(out_file)
            dst.close()
            created.append(out_file)
            part += 1
    return created