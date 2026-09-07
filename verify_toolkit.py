# verify_toolkit.py

import os
import sys
import unittest
from pathlib import Path
import fitz  # PyMuPDF
import pikepdf

# Add current directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from split_pdf import (
    parse_page_range,
    render_thumbnail,
    get_pdf_page_count,
    split_pdf_by_range,
    split_pdf_every_n_pages
)
from app import app, FILES_DIR

class TestPDFSplitter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = FILES_DIR / "test_scratch"
        cls.test_dir.mkdir(parents=True, exist_ok=True)
        
        # Create a sample multi-page PDF (5 pages)
        cls.sample_pdf = cls.test_dir / "sample_5pages.pdf"
        doc = fitz.open()
        for i in range(1, 6):
            page = doc.new_page(width=595, height=842)
            page.insert_text((50, 100), f"Sample Document Page {i}", fontsize=24)
            page.insert_text((50, 150), f"This is paragraph text on page {i}.", fontsize=12)
        doc.save(str(cls.sample_pdf))
        doc.close()

    def test_01_range_parser(self):
        """Test page range parser with various formats"""
        self.assertEqual(parse_page_range("1-3", 10), [0, 1, 2])
        self.assertEqual(parse_page_range("1 & 5", 10), [0, 4])
        self.assertEqual(parse_page_range("even", 6), [1, 3, 5])
        self.assertEqual(parse_page_range("odd", 6), [0, 2, 4])
        self.assertEqual(parse_page_range("5-1", 10), [4, 3, 2, 1, 0])  # Reverse range
        self.assertEqual(parse_page_range("", 10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])  # Empty = all pages

    def test_02_pdf_thumbnail_and_count(self):
        """Test PDF page counting and thumbnail generation"""
        count = get_pdf_page_count(self.sample_pdf)
        self.assertEqual(count, 5)
        
        thumb_bytes = render_thumbnail(self.sample_pdf, page_num=1, target_width=200)
        self.assertTrue(len(thumb_bytes) > 0)
        self.assertTrue(thumb_bytes.startswith(b"\xff\xd8"))  # JPEG magic header

    def test_03_split_pdf_by_range(self):
        """Test splitting PDF by custom range"""
        out_pdf = self.test_dir / "split_1_to_3.pdf"
        res = split_pdf_by_range(self.sample_pdf, out_pdf, "1-3")
        self.assertEqual(res["extracted_pages"], 3)
        self.assertEqual(get_pdf_page_count(out_pdf), 3)

        # Test reverse range
        out_pdf_reverse = self.test_dir / "split_5_to_1.pdf"
        res = split_pdf_by_range(self.sample_pdf, out_pdf_reverse, "5-1")
        self.assertEqual(res["extracted_pages"], 5)
        self.assertEqual(get_pdf_page_count(out_pdf_reverse), 5)

    def test_04_split_pdf_every_n(self):
        """Test splitting PDF into chunks of N pages"""
        every_dir = self.test_dir / "every_2"
        every_dir.mkdir(parents=True, exist_ok=True)
        parts = split_pdf_every_n_pages(self.sample_pdf, every_dir, n=2)
        self.assertEqual(len(parts), 3)  # 5 pages divided by 2 -> 2, 2, 1 pages
        
        # Verify each chunk has correct page count
        expected_counts = [2, 2, 1]
        for i, part in enumerate(parts):
            self.assertEqual(get_pdf_page_count(part), expected_counts[i])

    def test_05_flask_routes(self):
        """Test Flask API endpoints"""
        client = app.test_client()
        
        # Test GET /
        res = client.get("/")
        self.assertEqual(res.status_code, 200)

        # Test POST /upload
        with open(self.sample_pdf, "rb") as f:
            res = client.post("/upload", data={"file": (f, "test_upload.pdf")})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["filename"], "test_upload.pdf")
        self.assertEqual(data["page_count"], 5)

        # Test GET /thumbnail/<file>/<page>
        res = client.get("/thumbnail/test_upload.pdf/1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "image/jpeg")

        # Test POST /split with range mode
        res = client.post("/split", json={
            "filename": "test_upload.pdf",
            "split_mode": "range",
            "range_str": "1-2"
        })
        self.assertEqual(res.status_code, 200)
        split_file = res.get_json()["output_filename"]

        # Test GET /download/<filename>
        res = client.get(f"/download/{split_file}")
        self.assertEqual(res.status_code, 200)

        # Test POST /split with every_n mode
        res = client.post("/split", json={
            "filename": "test_upload.pdf",
            "split_mode": "every_n",
            "every_n": 2
        })
        self.assertEqual(res.status_code, 200)
        result = res.get_json()
        self.assertTrue("output_filename" in result or "zip_filename" in result)

if __name__ == "__main__":
    # Run tests with verbose output
    unittest.main(verbosity=2)