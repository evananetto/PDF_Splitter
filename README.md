# PDF Splitter

A simple, clean web application to split PDF files into smaller documents.

## Features

- **Upload PDF** - Drag and drop or browse to upload your PDF file
- **Custom Range Selection** - Select specific pages using range expressions like:
  - `1-5` - Pages 1 through 5
  - `1,3,5,7` - Specific pages
  - `even` - All even-numbered pages
  - `odd` - All odd-numbered pages
- **Visual Page Selection** - Click on thumbnails to select/deselect individual pages
- **Drag to Reorder** - Drag thumbnails to reorder pages before extraction
- **Every N Pages** - Split PDF into chunks of N pages
- **Download** - Download selected pages as a single PDF or multiple PDFs in a ZIP file

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt