(() => {
    "use strict";

    window.PDFViewerApp = class PDFViewerApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            this.record = null;
            this.file = null;
            this.pdfUrl = "";
            this.zoom = 1;
            this.rotation = 0;
            this.page = 1;
            this.totalPages = 0;
            this.searchQuery = "";
            this.pdfDoc = null;
            this.container = null;
            this.searchResults = [];
        }

        async open(file) {
            const record = this.windowManager.create({
                appId: "pdf-viewer",
                title: "📄 PDF Viewer",
                className: "pdf-viewer-window",
                content: this.createView(),
                onMount: current => this.bind(current),
                onClose: () => this.destroy()
            });
            this.record = record;
            this.file = file || null;
            if (file) await this.loadPdf(file);
        }

        createView() {
            const root = document.createElement("div");
            root.className = "pdf-viewer-app";
            root.innerHTML = `
                <div class="pdf-toolbar">
                    <div class="pdf-toolbar-group">
                        <button type="button" data-action="open-file" class="toolbar-btn">📂 Open</button>
                        <button type="button" data-action="zoom-out" class="toolbar-btn">−</button>
                        <button type="button" data-action="zoom-in" class="toolbar-btn">＋</button>
                        <button type="button" data-action="fit-width" class="toolbar-btn">↔ Fit</button>
                        <button type="button" data-action="fit-page" class="toolbar-btn">▣ Page</button>
                        <button type="button" data-action="rotate" class="toolbar-btn">↻ Rotate</button>
                    </div>
                    <div class="pdf-toolbar-group">
                        <input class="pdf-search" type="search" data-role="search" placeholder="Search text" aria-label="Search text">
                        <button type="button" data-action="search" class="toolbar-btn">🔎 Find</button>
                    </div>
                    <div class="pdf-toolbar-group">
                        <button type="button" data-action="prev-page" class="toolbar-btn">◀</button>
                        <span data-role="page-status">1 / 1</span>
                        <button type="button" data-action="next-page" class="toolbar-btn">▶</button>
                        <button type="button" data-action="fullscreen" class="toolbar-btn">⛶ Fullscreen</button>
                        <button type="button" data-action="print" class="toolbar-btn">🖨 Print</button>
                    </div>
                </div>
                <div class="pdf-shell">
                    <aside class="pdf-sidebar">
                        <div class="pdf-sidebar-card">
                            <h3>Bookmarks</h3>
                            <p>Quick jumps to important sections</p>
                        </div>
                        <div class="pdf-sidebar-card">
                            <h3>Thumbnails</h3>
                            <div class="pdf-thumbnail">Preview pane</div>
                        </div>
                    </aside>
                    <div class="pdf-canvas-shell" data-role="canvas-shell"></div>
                </div>
            `;
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".pdf-viewer-app");
            root.addEventListener("click", event => this.handleClick(event));
            root.querySelector("[data-role=search]").addEventListener("keydown", event => { if (event.key === "Enter") this.searchText(); });
            document.addEventListener("keydown", event => this.handleKeydown(event));
            root.addEventListener("dragover", event => event.preventDefault());
            root.addEventListener("drop", event => this.handleDrop(event));
        }

        handleClick(event) {
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action === "zoom-in") this.zoomIn();
            if (action === "zoom-out") this.zoomOut();
            if (action === "fit-width") this.fitWidth();
            if (action === "fit-page") this.fitPage();
            if (action === "rotate") this.rotate();
            if (action === "search") this.searchText();
            if (action === "next-page") this.nextPage();
            if (action === "prev-page") this.prevPage();
            if (action === "fullscreen") this.toggleFullscreen();
            if (action === "print") this.printPdf();
            if (action === "open-file") this.openFromPicker();
        }

        handleKeydown(event) {
            if (!this.record) return;
            if (event.key === "+" || event.key === "=") this.zoomIn();
            if (event.key === "-") this.zoomOut();
            if (event.key === "ArrowRight") this.nextPage();
            if (event.key === "ArrowLeft") this.prevPage();
            if (event.key === "f") this.toggleFullscreen();
        }

        handleDrop(event) {
            event.preventDefault();
            const file = event.dataTransfer?.files?.[0];
            if (file?.type === "application/pdf") this.loadPdf(file);
            else this.notifications?.show("Please drop a PDF file.", "error");
        }

        async openFromPicker() {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".pdf,application/pdf";
            input.onchange = async () => {
                const file = input.files?.[0];
                if (file) await this.loadPdf(file);
            };
            input.click();
        }

        async loadPdf(file) {
            try {
                if (!window.pdfjsLib?.getDocument) {
                    this.notifications?.show("PDF.js is not available in this session.", "error");
                    return;
                }
                const source = file?.content ? `data:application/pdf;base64,${file.content}` : URL.createObjectURL(file);
                this.file = file;
                this.pdfUrl = source;
                const pdf = await window.pdfjsLib.getDocument(source).promise;
                this.pdfDoc = pdf;
                this.totalPages = pdf.numPages;
                this.page = 1;
                this.renderPage();
                this.notifications?.show(`Opened ${file.name || "PDF"}`);
            } catch (error) {
                this.notifications?.show(error?.message || "Unable to open PDF", "error");
            }
        }

        async renderPage() {
            if (!this.record || !this.pdfDoc) return;
            const shell = this.record.content.querySelector("[data-role=canvas-shell]");
            shell.replaceChildren();
            const page = await this.pdfDoc.getPage(this.page);
            const viewport = page.getViewport({ scale: this.zoom, rotation: this.rotation });
            const canvas = document.createElement("canvas");
            canvas.className = "pdf-canvas";
            const context = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport }).promise;
            shell.appendChild(canvas);
            this.record.content.querySelector("[data-role=page-status]").textContent = `${this.page} / ${this.totalPages}`;
        }

        zoomIn() { this.zoom = Math.min(3, this.zoom + .25); this.renderPage(); }
        zoomOut() { this.zoom = Math.max(.5, this.zoom - .25); this.renderPage(); }
        fitWidth() { this.zoom = 1; this.renderPage(); }
        fitPage() { this.zoom = 1; this.renderPage(); }
        rotate() { this.rotation = (this.rotation + 90) % 360; this.renderPage(); }
        nextPage() { if (this.page < this.totalPages) { this.page += 1; this.renderPage(); } }
        prevPage() { if (this.page > 1) { this.page -= 1; this.renderPage(); } }
        async searchText() { this.searchQuery = this.record?.content.querySelector("[data-role=search]").value || ""; this.notifications?.show(this.searchQuery ? `Searching for “${this.searchQuery}”` : "Enter a search term", "info"); }
        toggleFullscreen() { const root = this.record?.element; if (!root) return; root.requestFullscreen?.(); }
        printPdf() { window.print(); }
        destroy() { this.record = null; this.pdfDoc = null; this.page = 1; }
    };
})();
