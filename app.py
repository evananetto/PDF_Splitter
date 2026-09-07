# app.py

import os
import uuid
import zipfile
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_from_directory, Response

from split_pdf import (
    render_thumbnail,
    get_pdf_page_count,
    split_pdf_by_range,
    split_pdf_every_n_pages
)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB limit

# Single local folder for uploads and generated outputs
FILES_DIR = Path(__file__).resolve().parent / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)

# ==================== AUTO CLEANUP FUNCTION ====================
def cleanup_old_files(days_old=1):
    """
    Automatically delete files older than specified days.
    This runs when the app starts.
    
    Args:
        days_old (int): Delete files older than this many days. Default: 1
    
    Returns:
        int: Number of files deleted
    """
    try:
        cutoff_time = datetime.now() - timedelta(days=days_old)
        deleted_count = 0
        deleted_size = 0
        
        for file_path in FILES_DIR.iterdir():
            if file_path.is_file():
                # Get file modification time
                file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                
                # Delete if older than cutoff
                if file_mtime < cutoff_time:
                    file_size = file_path.stat().st_size
                    file_path.unlink()
                    deleted_count += 1
                    deleted_size += file_size
                    print(f"🧹 Deleted old file: {file_path.name} ({file_size / 1024:.1f} KB)")
        
        # Remove empty directories (like split_parts_* folders)
        for dir_path in FILES_DIR.iterdir():
            if dir_path.is_dir():
                try:
                    # Check if directory is empty
                    if not any(dir_path.iterdir()):
                        dir_path.rmdir()
                        print(f"🧹 Removed empty directory: {dir_path.name}")
                except OSError:
                    # Directory not empty or permission issue, skip
                    pass
        
        if deleted_count > 0:
            print(f"✅ Auto-cleanup complete: Deleted {deleted_count} files ({deleted_size / (1024 * 1024):.2f} MB)")
        else:
            print("✅ Auto-cleanup: No old files to delete")
            
        return deleted_count
        
    except Exception as e:
        print(f"⚠️ Cleanup error: {e}")
        return 0

# ==================== RUN CLEANUP ON STARTUP ====================
# Delete files older than 1 day when the app starts
cleanup_old_files(days_old=1)

# ==================== ROUTES ====================
@app.route("/")
def index():
    return render_template("split.html")

@app.route("/split")
def split():
    return render_template("split.html")

@app.route("/upload", methods=["POST"])
def upload_file():
    """
    Upload a PDF file.
    Automatically cleans up files older than 1 day on each upload.
    """
    # Optional: Run cleanup on each upload to keep files folder clean
    cleanup_old_files(days_old=1)
    
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
        
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400
        
    filename = file.filename
    saved_path = FILES_DIR / filename
    
    # Check if file already exists, if so, add timestamp to avoid conflicts
    if saved_path.exists():
        name, ext = os.path.splitext(filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{name}_{timestamp}{ext}"
        saved_path = FILES_DIR / filename
    
    file.save(saved_path)
    
    page_count = 0
    if filename.lower().endswith(".pdf"):
        try:
            page_count = get_pdf_page_count(saved_path)
        except Exception:
            page_count = 0
            
    return jsonify({
        "filename": filename,
        "size_bytes": saved_path.stat().st_size,
        "page_count": page_count
    })

@app.route("/thumbnail/<path:filename>/<int:page_num>")
def page_thumbnail_route(filename, page_num):
    """
    Generate a thumbnail image for a specific page of a PDF.
    """
    file_path = FILES_DIR / filename
    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404
        
    width = request.args.get("width", default=300, type=int)
    try:
        img_bytes = render_thumbnail(file_path, page_num, target_width=width)
        return Response(img_bytes, mimetype="image/jpeg")
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/split", methods=["POST"])
def split_route():
    """
    Split a PDF by range or by every N pages.
    """
    data = request.json or {}
    filename = data.get("filename")
    split_mode = data.get("split_mode", "range")
    range_str = data.get("range_str", "")
    every_n = int(data.get("every_n", 5))
    
    if not filename:
        return jsonify({"error": "Filename is required"}), 400
        
    input_path = FILES_DIR / filename
    if not input_path.exists():
        return jsonify({"error": "Input file not found"}), 404

    try:
        if split_mode == "every_n":
            # Create a unique directory for this split operation
            out_dir = FILES_DIR / f"split_parts_{uuid.uuid4().hex[:8]}"
            out_dir.mkdir(parents=True, exist_ok=True)
            
            # Split the PDF into chunks
            created_files = split_pdf_every_n_pages(input_path, out_dir, every_n)
            
            if not created_files:
                return jsonify({"error": "No files created"}), 400
            
            # If only one file, return it directly (no zip needed)
            if len(created_files) == 1:
                return jsonify({
                    "message": f"Successfully split into 1 PDF part",
                    "output_filename": created_files[0].name
                })
            
            # Multiple files - create a zip
            zip_filename = f"{input_path.stem}_split_parts_{uuid.uuid4().hex[:6]}.zip"
            zip_path = FILES_DIR / zip_filename
            
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in created_files:
                    zf.write(f, arcname=f.name)
            
            # Clean up individual files and directory (keep only the zip)
            for f in created_files:
                try:
                    f.unlink()
                except Exception:
                    pass
            try:
                out_dir.rmdir()
            except Exception:
                pass
            
            return jsonify({
                "message": f"Successfully split into {len(created_files)} PDF parts",
                "output_filename": zip_filename,
                "file_count": len(created_files)
            })
            
        else:  # range mode
            out_filename = f"split_{uuid.uuid4().hex[:6]}_{filename}"
            out_path = FILES_DIR / out_filename
            res = split_pdf_by_range(input_path, out_path, range_str)
            return jsonify({
                "message": f"Successfully extracted {res['extracted_pages']} pages",
                "output_filename": out_filename,
                "extracted_pages": res['extracted_pages'],
                "total_pages": res['total_pages']
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/download/<path:filename>")
def download_route(filename):
    """
    Download a file from the files directory.
    """
    # Security check: Prevent path traversal attacks
    safe_path = Path(filename)
    if ".." in filename or filename.startswith("/"):
        return jsonify({"error": "Invalid file path"}), 400
        
    file_path = FILES_DIR / filename
    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404
        
    return send_from_directory(FILES_DIR, filename, as_attachment=True)

# ==================== OPTIONAL: MANUAL CLEANUP ENDPOINT ====================
@app.route("/cleanup", methods=["POST"])
def cleanup_route():
    """
    Manual cleanup endpoint - can be called from the UI to clean up files.
    """
    try:
        days = request.json.get("days", 1) if request.json else 1
        deleted = cleanup_old_files(days_old=days)
        return jsonify({
            "message": f"Cleanup complete. Deleted {deleted} files older than {days} day(s).",
            "deleted_count": deleted,
            "days": days
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==================== RUN THE APP ====================
if __name__ == "__main__":
    # Use the PORT environment variable Render provides, or default to 5000
    port = int(os.environ.get('PORT', 4000))
    app.run(host='0.0.0.0', port=port, debug=False)