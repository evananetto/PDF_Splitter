// split.js

// Split PDF Module
const SplitModule = (function() {
    'use strict';
    // Private state
    const state = {
        activeSplitFile: null,
        totalSplitPages: 0,
        selectedSplitPages: [],
        currentSplitMode: 'range',
        pageOrder: [] // Track custom page order
    };
    // DOM elements
    const elements = {};
    let dragState = {
        draggedIndex: null,
        draggedElement: null
    };
    let isUpdatingFromInput = false; // Prevent recursive updates
    // ==================== DOM CACHING ====================
    function cacheElements() {
        elements.splitUploadZone = document.getElementById('split-upload-zone');
        elements.splitFileInput = document.getElementById('split-file-input');
        elements.splitFileStatus = document.getElementById('split-file-status');
        elements.splitFilename = document.getElementById('split-filename');
        elements.splitFileinfo = document.getElementById('split-fileinfo');
        elements.splitWorkspace = document.getElementById('split-workspace');
        elements.thumbnailGrid = document.getElementById('thumbnail-grid');
        elements.rangeInput = document.getElementById('range-input');
        elements.everyNInput = document.getElementById('every-n-input');
        elements.modeRangeBtn = document.getElementById('mode-range-btn');
        elements.modeEveryBtn = document.getElementById('mode-every-btn');
        elements.rangeControlGroup = document.getElementById('range-control-group');
        elements.everyControlGroup = document.getElementById('every-control-group');
        elements.executeBtn = document.getElementById('execute-split-btn');
    }
    // ==================== SPLIT PDF FUNCTIONS ====================
    async function uploadSplitFile(input) {
        const file = input.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            if (window.PDFToolkit) {
                window.PDFToolkit.showToast('Uploading...', 'Please wait while your file is being uploaded.', 'info', 0);
            }

            const res = await fetch('/upload', { method: 'POST', body: formData });
            const data = await res.json();

            if (window.PDFToolkit) {
                window.PDFToolkit.closeToast();
            }

            if (data.error) {
                if (window.PDFToolkit) {
                    window.PDFToolkit.showToast('Upload Failed', data.error, 'error');
                }
                return;
            }
            state.activeSplitFile = data.filename;
            state.totalSplitPages = data.page_count;
            state.selectedSplitPages = [];
            state.pageOrder = Array.from({ length: state.totalSplitPages }, (_, i) => i + 1);
            elements.splitFilename.innerText = data.filename;
            elements.splitFileinfo.innerText = `${data.page_count} pages · ${(data.size_bytes / (1024 * 1024)).toFixed(2)} MB`;
            elements.splitUploadZone.classList.add('hidden');
            elements.splitFileStatus.classList.remove('hidden');
            elements.splitWorkspace.classList.remove('hidden');
            renderThumbnails();
            updateRangeInputFromSelection();

            if (window.PDFToolkit) {
                window.PDFToolkit.showToast('Upload Complete', `Successfully uploaded "${data.filename}" with ${data.page_count} pages.`, 'success');
            }
        } catch (err) {
            if (window.PDFToolkit) {
                window.PDFToolkit.closeToast();
                window.PDFToolkit.showToast('Upload Failed', 'Network error or server unavailable.', 'error');
            }
        }
    }
    function renderThumbnails() {
        const grid = elements.thumbnailGrid;
        if (!grid) return;
        grid.innerHTML = '';

        const pagesToRender = state.pageOrder.length > 0 ? state.pageOrder :
            Array.from({ length: state.totalSplitPages }, (_, i) => i + 1);

        pagesToRender.forEach((pageNum, index) => {
            const isSelected = state.selectedSplitPages.includes(pageNum);
            const card = document.createElement('div');
            card.className = `thumb-card relative rounded-md bg-white border ${isSelected ? 'border-navy' : 'border-line'} cursor-grab group overflow-hidden`;
            card.draggable = true;
            card.dataset.pageIndex = index;
            card.dataset.pageNumber = pageNum;
            // Drag events
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('dragenter', handleDragEnter);
            card.addEventListener('drop', handleDrop);
            // Click to toggle selection (not drag)
            card.addEventListener('click', (e) => {
                if (!dragState.draggedElement) {
                    togglePageSelection(pageNum);
                }
            });
            // Tab header (filing-card style)
            const headerDiv = document.createElement('div');
            headerDiv.className = `flex justify-between items-center px-2.5 py-1.5 ${isSelected ? 'bg-navy text-white' : 'bg-surface2 text-ink2'}`;
            headerDiv.innerHTML = `
                <span class="font-mono text-[0.68rem] font-medium">PAGE ${String(pageNum).padStart(3, '0')}</span>
                ${isSelected ? '<i class="fas fa-check text-[0.65rem]"></i>' : ''}
            `;
            card.appendChild(headerDiv);
            // Create image container with loading state
            const imgContainer = document.createElement('div');
            imgContainer.className = 'aspect-[1/1.4] bg-paper overflow-hidden flex items-center justify-center relative p-2';

            const img = document.createElement('img');
            img.src = `/thumbnail/${encodeURIComponent(state.activeSplitFile)}/${pageNum}`;
            img.loading = 'lazy';
            img.className = 'w-full h-full object-contain shadow-sm';
            img.alt = `Page ${pageNum}`;

            // Loader overlay
            const loader = document.createElement('div');
            loader.className = 'absolute inset-0 flex items-center justify-center bg-paper transition-opacity duration-300';
            loader.innerHTML = '<div class="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin"></div>';

            // Error handling with retry
            let retryCount = 0;
            const maxRetries = 3;

            img.onerror = function() {
                const img = this;
                retryCount++;

                if (retryCount <= maxRetries) {
                    // Show error state briefly then retry
                    const container = img.parentElement;
                    const loader = container.querySelector('.absolute');
                    if (loader) {
                        loader.innerHTML = `
                            <div class="text-center">
                                <i class="fas fa-triangle-exclamation text-danger text-lg mb-2"></i>
                                <p class="text-[0.65rem] text-ink2 font-mono">Retrying (${retryCount}/${maxRetries})</p>
                                <div class="w-5 h-5 border-2 border-navy border-t-transparent rounded-full animate-spin mx-auto mt-2"></div>
                            </div>
                        `;
                        loader.style.opacity = '1';
                    }

                    // Retry after delay
                    setTimeout(() => {
                        img.src = `/thumbnail/${encodeURIComponent(state.activeSplitFile)}/${pageNum}?_t=${Date.now()}`;
                    }, 1500 * retryCount);
                } else {
                    // Max retries exceeded - show fallback
                    const container = img.parentElement;
                    const loader = container.querySelector('.absolute');
                    if (loader) {
                        loader.innerHTML = `
                            <div class="text-center">
                                <i class="fas fa-file-lines text-line2 text-2xl mb-2"></i>
                                <p class="text-xs text-ink2 font-medium">Page ${pageNum}</p>
                                <p class="text-[0.65rem] text-line2">Preview unavailable</p>
                            </div>
                        `;
                        loader.style.opacity = '1';
                    }
                }
            };

            img.onload = function() {
                const loader = this.parentElement.querySelector('.absolute');
                if (loader) {
                    loader.style.opacity = '0';
                    setTimeout(() => {
                        loader.style.display = 'none';
                    }, 300);
                }
            };

            imgContainer.appendChild(img);
            imgContainer.appendChild(loader);
            card.appendChild(imgContainer);

            // Add drag handle
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle text-line2 hover:text-navy cursor-grab opacity-0 group-hover:opacity-100 transition-opacity';
            dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
            card.querySelector('.drag-indicator')?.appendChild(dragHandle);

            grid.appendChild(card);
        });
        updateSelectionCount();
    }
    // ==================== DRAG AND DROP HANDLERS ====================
    function handleDragStart(e) {
        const card = e.target.closest('.thumb-card');
        if (!card) return;

        dragState.draggedIndex = parseInt(card.dataset.pageIndex);
        dragState.draggedElement = card;
        card.style.opacity = '0.5';

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', card.innerHTML);
    }
    function handleDragEnd(e) {
        const card = e.target.closest('.thumb-card');
        if (card) {
            card.style.opacity = '1';
            card.classList.remove('drag-over');
        }

        // Reset drag state
        setTimeout(() => {
            dragState.draggedIndex = null;
            dragState.draggedElement = null;
        }, 100);
    }
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const card = e.target.closest('.thumb-card');
        if (card && dragState.draggedElement && card !== dragState.draggedElement) {
            card.classList.add('drag-over');
        }
    }
    function handleDragEnter(e) {
        e.preventDefault();
        const card = e.target.closest('.thumb-card');
        if (card && dragState.draggedElement && card !== dragState.draggedElement) {
            card.classList.add('drag-over');
        }
    }
    function handleDrop(e) {
        e.preventDefault();
        const targetCard = e.target.closest('.thumb-card');
        if (!targetCard || !dragState.draggedElement || targetCard === dragState.draggedElement) {
            return;
        }
        const targetIndex = parseInt(targetCard.dataset.pageIndex);
        const draggedIndex = dragState.draggedIndex;
        if (draggedIndex !== targetIndex) {
            // Reorder the pageOrder array
            const [movedPage] = state.pageOrder.splice(draggedIndex, 1);
            state.pageOrder.splice(targetIndex, 0, movedPage);

            // Re-render thumbnails
            renderThumbnails();
            updateRangeInputFromSelection();

            if (window.PDFToolkit) {
                window.PDFToolkit.showToast('Reordered', `Page moved to position ${targetIndex + 1}`, 'info', 1500);
            }
        }
        // Clean up
        document.querySelectorAll('.thumb-card.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
    }
    // ==================== PAGE SELECTION ====================
    function togglePageSelection(pageNum) {
        if (isUpdatingFromInput) return;

        const idx = state.selectedSplitPages.indexOf(pageNum);
        if (idx === -1) {
            state.selectedSplitPages.push(pageNum);
        } else {
            state.selectedSplitPages.splice(idx, 1);
        }
        updateRangeInputFromSelection();
        renderThumbnails();

        const total = state.selectedSplitPages.length;
        if (total > 0 && window.PDFToolkit) {
            window.PDFToolkit.showToast('Selection Updated', `${total} page${total > 1 ? 's' : ''} selected.`, 'info', 1500);
        }
    }
    function selectAllPages() {
        state.selectedSplitPages = Array.from({ length: state.totalSplitPages }, (_, i) => i + 1);
        updateRangeInputFromSelection();
        renderThumbnails();
        if (window.PDFToolkit) {
            window.PDFToolkit.showToast('All Selected', `All ${state.totalSplitPages} pages selected.`, 'info', 1500);
        }
    }
    function deselectAllPages() {
        state.selectedSplitPages = [];
        updateRangeInputFromSelection();
        renderThumbnails();
        if (window.PDFToolkit) {
            window.PDFToolkit.showToast('Cleared', 'All page selections cleared.', 'info', 1500);
        }
    }
    function updateSelectionCount() {
        const count = state.selectedSplitPages.length;
        const total = state.totalSplitPages;
        const countElement = document.getElementById('selection-count');
        if (countElement) {
            countElement.textContent = `${count} / ${total}`;
        }
        const mobileEl = document.getElementById('selection-count-mobile');
        if (mobileEl) {
            mobileEl.textContent = `${count} / ${total} selected`;
        }
    }
    // ==================== RANGE INPUT HANDLING ====================
    function updateRangeInputFromSelection() {
        if (isUpdatingFromInput) return;

        if (state.selectedSplitPages.length === 0) {
            elements.rangeInput.value = '';
            return;
        }
        // Use pageOrder to maintain custom order in range input
        const orderedSelection = state.pageOrder.filter(p => state.selectedSplitPages.includes(p));
        if (orderedSelection.length === 0) {
            elements.rangeInput.value = '';
            return;
        }

        const ranges = [];
        let start = orderedSelection[0];
        let end = start;
        for (let i = 1; i < orderedSelection.length; i++) {
            if (orderedSelection[i] === end + 1) {
                end = orderedSelection[i];
            } else {
                ranges.push(start === end ? `${start}` : `${start}-${end}`);
                start = orderedSelection[i];
                end = start;
            }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        elements.rangeInput.value = ranges.join(', ');
    }
    function parseRangeInput(inputStr) {
        if (!inputStr || inputStr.trim() === '') {
            return [];
        }
        const pages = new Set();
        const parts = inputStr.split(',').map(s => s.trim());

        for (const part of parts) {
            if (part.includes('-')) {
                // Range: e.g., "1-5"
                const [start, end] = part.split('-').map(s => parseInt(s.trim()));
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    for (let i = start; i <= end; i++) {
                        if (i >= 1 && i <= state.totalSplitPages) {
                            pages.add(i);
                        }
                    }
                }
            } else if (part.toLowerCase() === 'even') {
                // Even pages
                for (let i = 2; i <= state.totalSplitPages; i += 2) {
                    pages.add(i);
                }
            } else if (part.toLowerCase() === 'odd') {
                // Odd pages
                for (let i = 1; i <= state.totalSplitPages; i += 2) {
                    pages.add(i);
                }
            } else {
                // Single page
                const pageNum = parseInt(part);
                if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= state.totalSplitPages) {
                    pages.add(pageNum);
                }
            }
        }

        return Array.from(pages).sort((a, b) => a - b);
    }
    function handleRangeInputChange() {
        const inputValue = elements.rangeInput.value;
        const parsedPages = parseRangeInput(inputValue);

        if (parsedPages.length > 0) {
            // Update selection based on parsed pages
            isUpdatingFromInput = true;
            state.selectedSplitPages = parsedPages;

            // Reorder pageOrder to match the input order
            const orderedPages = [];
            const remainingPages = state.pageOrder.filter(p => !parsedPages.includes(p));

            // Add selected pages in the order they appear in the input
            const parts = inputValue.split(',').map(s => s.trim());
            for (const part of parts) {
                if (part.includes('-')) {
                    const [start, end] = part.split('-').map(s => parseInt(s.trim()));
                    if (!isNaN(start) && !isNaN(end) && start <= end) {
                        for (let i = start; i <= end; i++) {
                            if (parsedPages.includes(i) && !orderedPages.includes(i)) {
                                orderedPages.push(i);
                            }
                        }
                    }
                } else if (part.toLowerCase() === 'even') {
                    for (let i = 2; i <= state.totalSplitPages; i += 2) {
                        if (parsedPages.includes(i) && !orderedPages.includes(i)) {
                            orderedPages.push(i);
                        }
                    }
                } else if (part.toLowerCase() === 'odd') {
                    for (let i = 1; i <= state.totalSplitPages; i += 2) {
                        if (parsedPages.includes(i) && !orderedPages.includes(i)) {
                            orderedPages.push(i);
                        }
                    }
                } else {
                    const pageNum = parseInt(part);
                    if (!isNaN(pageNum) && parsedPages.includes(pageNum) && !orderedPages.includes(pageNum)) {
                        orderedPages.push(pageNum);
                    }
                }
            }

            // Add remaining pages (unselected) after selected ones
            state.pageOrder = [...orderedPages, ...remainingPages];

            renderThumbnails();
            isUpdatingFromInput = false;
        } else if (inputValue === '') {
            // Clear selection if input is empty
            isUpdatingFromInput = true;
            state.selectedSplitPages = [];
            renderThumbnails();
            isUpdatingFromInput = false;
        }
    }
    function setSplitMode(mode) {
        state.currentSplitMode = mode;
        elements.modeRangeBtn.className = `seg-btn flex-1 lg:flex-none px-4 py-2.5 lg:py-2 rounded-[5px] text-sm ${mode === 'range' ? 'bg-navy text-white font-semibold' : 'text-ink2 font-medium'}`;
        elements.modeEveryBtn.className = `seg-btn flex-1 lg:flex-none px-4 py-2.5 lg:py-2 rounded-[5px] text-sm ${mode === 'every_n' ? 'bg-navy text-white font-semibold' : 'text-ink2 font-medium'}`;
        elements.rangeControlGroup.classList.toggle('hidden', mode !== 'range');
        elements.rangeControlGroup.classList.toggle('flex', mode === 'range');
        elements.everyControlGroup.classList.toggle('hidden', mode !== 'every_n');
        elements.everyControlGroup.classList.toggle('flex', mode === 'every_n');

        // Update button text based on mode
        const executeBtn = elements.executeBtn;
        if (executeBtn) {
            if (mode === 'every_n') {
                executeBtn.innerHTML = `<i class="fas fa-layer-group"></i> Split`;
            } else {
                executeBtn.innerHTML = `<i class="fas fa-download"></i> Download`;
            }
        }
    }
    // ==================== EXECUTE SPLIT ====================
    async function executeSplit() {
        if (!state.activeSplitFile) {
            if (window.PDFToolkit) {
                window.PDFToolkit.showToast('No File', 'Please upload a PDF file first.', 'error');
            }
            return;
        }
        let everyN = parseInt(elements.everyNInput.value) || 5;

        // ===== EVERY N MODE =====
        if (state.currentSplitMode === 'every_n') {
            if (everyN < 1) {
                if (window.PDFToolkit) {
                    window.PDFToolkit.showToast('Invalid Input', 'Pages per chunk must be at least 1.', 'error');
                }
                return;
            }

            try {
                if (window.PDFToolkit) {
                    window.PDFToolkit.showToast('Processing...', `Splitting every ${everyN} pages. Please wait...`, 'info', 0);
                }

                const res = await fetch('/split', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: state.activeSplitFile,
                        split_mode: 'every_n',
                        range_str: '',
                        every_n: everyN
                    })
                });
                const data = await res.json();

                if (window.PDFToolkit) {
                    window.PDFToolkit.closeToast();
                }

                if (data.error) {
                    if (window.PDFToolkit) {
                        window.PDFToolkit.showToast('Split Failed', data.error, 'error');
                    }
                    return;
                }
                // Handle the response
                if (data.zip_filename) {
                    // Multiple files - download as zip
                    const downloadLink = document.createElement('a');
                    downloadLink.href = `/download/${data.zip_filename}`;
                    downloadLink.download = data.zip_filename;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);

                    if (window.PDFToolkit) {
                        window.PDFToolkit.showToast('Split Complete', `Created ${data.file_count} files. Downloading zip...`, 'success', 3000);
                    }
                } else if (data.output_filename) {
                    // Single file - download directly
                    const downloadLink = document.createElement('a');
                    downloadLink.href = `/download/${data.output_filename}`;
                    downloadLink.download = data.output_filename;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);

                    if (window.PDFToolkit) {
                        window.PDFToolkit.showToast('Split Complete', 'Downloading file...', 'success', 3000);
                    }
                }
            } catch (err) {
                if (window.PDFToolkit) {
                    window.PDFToolkit.closeToast();
                    window.PDFToolkit.showToast('Split Failed', 'Network error or server unavailable.', 'error');
                }
            }
            return;
        }
        // ===== RANGE MODE (existing code) =====
        let pagesToExtract = [];
        let rangeStr = '';
        if (state.selectedSplitPages.length === 0) {
            pagesToExtract = Array.from({ length: state.totalSplitPages }, (_, i) => i + 1);
            rangeStr = pagesToExtract.join(',');
        } else {
            pagesToExtract = state.pageOrder.filter(p => state.selectedSplitPages.includes(p));
            if (pagesToExtract.length === 0) {
                pagesToExtract = Array.from({ length: state.totalSplitPages }, (_, i) => i + 1);
                rangeStr = pagesToExtract.join(',');
            } else {
                rangeStr = pagesToExtract.join(',');
            }
        }
        try {
            if (window.PDFToolkit) {
                window.PDFToolkit.showToast('Processing...', 'Extracting pages. Please wait...', 'info', 0);
            }

            const res = await fetch('/split', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: state.activeSplitFile,
                    split_mode: 'range',
                    range_str: rangeStr,
                    every_n: everyN
                })
            });
            const data = await res.json();

            if (window.PDFToolkit) {
                window.PDFToolkit.closeToast();
            }

            if (data.error) {
                if (window.PDFToolkit) {
                    window.PDFToolkit.showToast('Extraction Failed', data.error, 'error');
                }
                return;
            }
            // Direct download
            const downloadLink = document.createElement('a');
            downloadLink.href = `/download/${data.output_filename}`;
            downloadLink.download = data.output_filename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            if (window.PDFToolkit) {
                window.PDFToolkit.showToast('Extraction Complete', `Successfully extracted ${pagesToExtract.length} pages. Downloading...`, 'success', 3000);
            }
        } catch (err) {
            if (window.PDFToolkit) {
                window.PDFToolkit.closeToast();
                window.PDFToolkit.showToast('Extraction Failed', 'Network error or server unavailable.', 'error');
            }
        }
    }
    // ==================== INITIALIZATION ====================
    function init() {
        cacheElements();
        if (elements.executeBtn) {
            elements.executeBtn.addEventListener('click', executeSplit);
        }
        // Add input event listener for range input
        if (elements.rangeInput) {
            elements.rangeInput.addEventListener('input', handleRangeInputChange);
            // Make it editable
            elements.rangeInput.readOnly = false;
            elements.rangeInput.placeholder = '1-5, 6-10, 1,3,5, even, odd';
        }
        console.log('Split Module initialized successfully');
    }
    // Public API - expose to global scope
    const publicAPI = {
        init: init,
        uploadSplitFile: uploadSplitFile,
        renderThumbnails: renderThumbnails,
        togglePageSelection: togglePageSelection,
        selectAllPages: selectAllPages,
        deselectAllPages: deselectAllPages,
        setSplitMode: setSplitMode,
        executeSplit: executeSplit,
        parseRangeInput: parseRangeInput
    };
    // Expose to global scope
    window.SplitModule = publicAPI;
    return publicAPI;
})();
// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.SplitModule) {
        window.SplitModule.init();
    }
});