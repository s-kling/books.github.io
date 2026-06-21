// ──────────────────────────────────────────────────────────
// Reading Tracker - Main Application
// ──────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────
// State Management
// ──────────────────────────────────────────────────────────

const STORAGE_KEYS = {
    BOOKS: 'reading_tracker_books',
    CURRENT_BOOK: 'reading_tracker_current_book',
    TARGET_DATE: 'reading_tracker_target_date',
    CURRENT_NIGHT_PLAN: 'reading_tracker_night_plan',
};

class ReadingTracker {
    constructor() {
        this.books = this.loadBooks();
        this.currentlyReadingBookId = this.loadCurrentBook();
        this.targetDate = this.loadTargetDate();
        this.nightlyReadingPlan = this.loadNightlyPlan();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.render();
    }

    // ──────────────────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────────────────

    loadBooks() {
        const stored = localStorage.getItem(STORAGE_KEYS.BOOKS);
        return stored ? JSON.parse(stored) : [];
    }

    loadCurrentBook() {
        return localStorage.getItem(STORAGE_KEYS.CURRENT_BOOK) || null;
    }

    loadTargetDate() {
        const stored = localStorage.getItem(STORAGE_KEYS.TARGET_DATE);
        if (stored) return stored;
        // Default to end of year
        const today = new Date();
        return `${today.getFullYear()}-12-31`;
    }

    loadNightlyPlan() {
        const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_NIGHT_PLAN);
        return stored ? JSON.parse(stored) : null;
    }

    saveBooks() {
        localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(this.books));
    }

    saveCurrentBook() {
        if (this.currentlyReadingBookId) {
            localStorage.setItem(STORAGE_KEYS.CURRENT_BOOK, this.currentlyReadingBookId);
        } else {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_BOOK);
        }
    }

    saveTargetDate() {
        localStorage.setItem(STORAGE_KEYS.TARGET_DATE, this.targetDate);
    }

    saveNightlyPlan() {
        if (this.nightlyReadingPlan) {
            localStorage.setItem(
                STORAGE_KEYS.CURRENT_NIGHT_PLAN,
                JSON.stringify(this.nightlyReadingPlan),
            );
        } else {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_NIGHT_PLAN);
        }
    }

    // ──────────────────────────────────────────────────────────
    // Book Management
    // ──────────────────────────────────────────────────────────

    addBook(bookData) {
        const book = {
            id: Date.now().toString(),
            title: bookData.title,
            author: bookData.author || '',
            genres: bookData.genres || [],
            totalPages: bookData.totalPages || 0,
            chapters: bookData.chapters || [],
            status: 'unread',
            currentPage: 0,
            dateAdded: new Date().toISOString(),
        };
        this.books.push(book);
        this.saveBooks();
        return book;
    }

    updateBook(bookId, bookData) {
        const book = this.books.find((b) => b.id === bookId);
        if (!book) return null;

        Object.assign(book, {
            title: bookData.title,
            author: bookData.author || '',
            genres: bookData.genres || [],
            totalPages: bookData.totalPages || book.totalPages,
            chapters: bookData.chapters || book.chapters,
        });

        this.saveBooks();
        return book;
    }

    ignoreBook(bookId, previousStatus) {
        const book = this.books.find((b) => b.id === bookId);
        if (!book) return;

        // Flip between ignored and previous status (unread/reading)
        book.status = previousStatus === 'ignored' ? '' : 'ignored';
        this.saveBooks();
    }

    deleteBook(bookId) {
        this.books = this.books.filter((b) => b.id !== bookId);
        if (this.currentlyReadingBookId === bookId) {
            this.currentlyReadingBookId = null;
            this.saveCurrentBook();
        }
        this.saveBooks();
    }

    getBook(bookId) {
        return this.books.find((b) => b.id === bookId);
    }

    // ──────────────────────────────────────────────────────────
    // Reading Progress
    // ──────────────────────────────────────────────────────────

    setCurrentlyReading(bookId) {
        const book = this.getBook(bookId);
        if (!book) return;

        if (this.currentlyReadingBookId && this.currentlyReadingBookId !== bookId) {
            const prevBook = this.getBook(this.currentlyReadingBookId);
            if (prevBook && prevBook.currentPage >= prevBook.totalPages) {
                prevBook.status = 'completed';
            } else if (prevBook) {
                prevBook.status = 'unread';
            }
        }

        this.currentlyReadingBookId = bookId;
        book.status = 'reading';
        this.saveBooks();
        this.saveCurrentBook();
        this.calculateNightlyReading();
        this.render();
    }

    logProgress(bookId, pageNumber) {
        const book = this.getBook(bookId);
        if (!book) return;

        book.currentPage = Math.min(pageNumber, book.totalPages);
        if (book.currentPage >= book.totalPages) {
            book.status = 'completed';
        }

        this.saveBooks();
    }

    // ──────────────────────────────────────────────────────────
    // Calculation: Pages Per Night
    // ──────────────────────────────────────────────────────────

    calculateNightlyReading() {
        const currentBook = this.getBook(this.currentlyReadingBookId);
        if (!currentBook || currentBook.status === 'completed') {
            this.nightlyReadingPlan = null;
            this.saveNightlyPlan();
            return;
        }

        const booksToRead = this.books.filter(
            (b) => b.status !== 'completed' && b.status !== 'ignored',
        );
        const totalPagesRemaining = booksToRead.reduce((sum, book) => {
            return sum + Math.max(0, book.totalPages - book.currentPage);
        }, 0);

        const today = new Date();
        const target = new Date(this.targetDate);
        const daysRemaining = Math.max(1, Math.ceil((target - today) / (1000 * 60 * 60 * 24)));

        const pagesPerNight = Math.ceil(totalPagesRemaining / daysRemaining);

        // Create nightly reading plan for current book
        const currentBookPages = Math.max(0, currentBook.totalPages - currentBook.currentPage);
        let endPage = currentBook.currentPage + pagesPerNight;

        // Try to end at chapter boundary
        if (currentBook.chapters.length > 0) {
            // find the closest chapter to where we want to end in both directions
            // find chapter after endPage and before endPage, and see which is closer
            const lateChapter = currentBook.chapters.find((c) => c.startPage > endPage)?.startPage;
            const earlyChapter = [...currentBook.chapters]
                .reverse()
                .find((c) => c.endPage < endPage)?.endPage;

            if (lateChapter && Math.abs(lateChapter - endPage) < 10) {
                // willing to read up to 10 pages further to finish a chapter
                endPage = lateChapter;
            } else if (earlyChapter && Math.abs(earlyChapter - endPage) < 12) {
                // willing to read up to 12 pages less if it means finishing a chapter
                endPage = earlyChapter;
            }
        }

        endPage = Math.min(endPage, currentBook.totalPages);

        this.nightlyReadingPlan = {
            bookId: this.currentlyReadingBookId,
            startPage: currentBook.currentPage,
            endPage: endPage,
            pagesPerNight: pagesPerNight,
            daysRemaining: daysRemaining,
            totalPagesRemaining: totalPagesRemaining,
        };

        this.saveNightlyPlan();
    }

    // ──────────────────────────────────────────────────────────
    // Statistics
    // ──────────────────────────────────────────────────────────

    getStats() {
        const today = new Date();
        const target = new Date(this.targetDate);
        const daysRemaining = Math.max(0, Math.ceil((target - today) / (1000 * 60 * 60 * 24)));

        const booksToRead = this.books.filter(
            (b) => b.status !== 'completed' && b.status !== 'ignored',
        );
        const totalPages = booksToRead.reduce(
            (sum, b) => sum + Math.max(0, b.totalPages - b.currentPage),
            0,
        );
        const pagesPerNight = daysRemaining > 0 ? Math.ceil(totalPages / daysRemaining) : 0;

        return {
            daysRemaining,
            pagesRemaining: totalPages,
            pagesPerNight,
            booksRemaining: booksToRead.length,
        };
    }

    // ──────────────────────────────────────────────────────────
    // Filtering
    // ──────────────────────────────────────────────────────────

    getFilteredBooks(statusFilter = 'all', genreFilter = 'all') {
        // Filter books, then sort by whatever is selected to sort by

        let filteredBooks = this.books.filter((book) => {
            const statusMatch = statusFilter === 'all' || book.status === statusFilter;
            const genreMatch = genreFilter === 'all' || book.genres.includes(genreFilter);
            return statusMatch && genreMatch;
        });

        const sortBy = document.querySelector('[data-sort].active')?.dataset.sort || 'default';

        return filteredBooks.sort((a, b) => {
            switch (sortBy) {
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                case 'title-desc':
                    return b.title.localeCompare(a.title);
                case 'author-asc':
                    return a.author.localeCompare(b.author);
                case 'author-desc':
                    return b.author.localeCompare(a.author);
                case 'progress-asc':
                    const aProgressAsc = a.currentPage / a.totalPages;
                    const bProgressAsc = b.currentPage / b.totalPages;
                    return aProgressAsc - bProgressAsc; // lowest progress first
                case 'progress-desc':
                    const aProgressDesc = a.currentPage / a.totalPages;
                    const bProgressDesc = b.currentPage / b.totalPages;
                    return bProgressDesc - aProgressDesc; // highest progress first
                case 'pages-asc':
                    const aPagesAsc = a.totalPages - a.currentPage;
                    const bPagesAsc = b.totalPages - b.currentPage;
                    return aPagesAsc - bPagesAsc; // least pages left first
                case 'pages-desc':
                    const aPagesDesc = a.totalPages - a.currentPage;
                    const bPagesDesc = b.totalPages - b.currentPage;
                    return bPagesDesc - aPagesDesc; // most pages left first
                default:
                    return new Date(a.dateAdded) - new Date(b.dateAdded); // newest first
            }
        });
    }

    getAllGenres() {
        const genres = new Set();
        this.books.forEach((book) => {
            book.genres.forEach((genre) => genres.add(genre));
        });
        return Array.from(genres).sort();
    }

    // ──────────────────────────────────────────────────────────
    // Event Listeners
    // ──────────────────────────────────────────────────────────

    setupEventListeners() {
        // Target date
        const targetDateInput = document.getElementById('target-date');
        targetDateInput.value = this.targetDate;
        targetDateInput.addEventListener('change', (e) => {
            this.targetDate = e.target.value;
            this.saveTargetDate();
            this.render();
        });

        // Add book button
        document.getElementById('add-book-btn').addEventListener('click', () => {
            openModal('book-modal-backdrop');
            this.resetBookForm();
        });

        // Book form submit
        document.getElementById('book-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleBookFormSubmit();
        });

        // Add chapter button
        document.getElementById('add-chapter-btn').addEventListener('click', () => {
            this.addChapterInput();
        });

        // Filter buttons
        this.setupFilterListeners();
    }

    setupFilterListeners() {
        const statusButtons = document.querySelectorAll('[data-status]');
        const genreButtons = document.querySelectorAll('[data-genre]');
        const sortButtons = document.querySelectorAll('[data-sort]');

        statusButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                statusButtons.forEach((b) => b.classList.remove('active'));
                e.target.classList.add('active');

                const genre = document.querySelector('[data-genre].active')?.dataset.genre || 'all';
                this.renderBooks(e.target.dataset.status, genre);
            });
        });

        genreButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                genreButtons.forEach((b) => b.classList.remove('active'));
                if (e.target.dataset.genre !== 'all') {
                    e.target.classList.add('active');
                    const status =
                        document.querySelector('[data-status].active')?.dataset.status || 'all';
                    this.renderBooks(status, e.target.dataset.genre);
                } else {
                    const status =
                        document.querySelector('[data-status].active')?.dataset.status || 'all';
                    this.renderBooks(status, 'all');
                }
            });
        });

        sortButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                sortButtons.forEach((b) => b.classList.remove('active'));
                e.target.classList.add('active');
                const status =
                    document.querySelector('[data-status].active')?.dataset.status || 'all';
                const genre = document.querySelector('[data-genre].active')?.dataset.genre || 'all';
                this.renderBooks(status, genre);
            });
        });
    }

    handleBookFormSubmit() {
        const editId = document.getElementById('edit-book-id').value;
        const title = document.getElementById('input-title').value.trim();
        const author = document.getElementById('input-author').value.trim();
        const genresInput = document.getElementById('input-genres').value.trim();
        const totalPages = parseInt(document.getElementById('input-total-pages').value) || 0;

        if (!title) {
            alert('Please enter a book title');
            return;
        }

        const genres = genresInput
            .split(',')
            .map((g) => g.trim())
            .filter((g) => g.length > 0);

        const chapters = this.collectChapters();

        if (!totalPages && chapters.length === 0) {
            alert('Please enter either total pages or chapters');
            return;
        }

        const calculatedPages =
            chapters.length > 0 ? Math.max(...chapters.map((c) => c.endPage)) : totalPages;

        const bookData = {
            title,
            author,
            genres,
            totalPages: calculatedPages || totalPages,
            chapters,
        };

        if (editId) {
            this.updateBook(editId, bookData);
            showToast('Book updated successfully');
        } else {
            this.addBook(bookData);
            showToast('Book added to your library');
        }

        closeModal('book-modal-backdrop');
        this.resetBookForm();
        this.render();
    }

    addChapterInput() {
        const container = document.getElementById('chapters-container');
        const index = container.children.length;
        const chapter = document.createElement('div');
        chapter.className = 'chapter-input-group';
        chapter.innerHTML = `
            <div>
                <label>Start Page</label>
                <input type="number" class="chapter-start" min="1" placeholder="1">
            </div>
            <div>
                <label>End Page</label>
                <input type="number" class="chapter-end" min="1" placeholder="10">
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="tracker.removeChapterInput(this)">Remove</button>
            `;
        container.appendChild(chapter);
    }

    removeChapterInput(btn) {
        btn.parentElement.remove();
    }

    collectChapters() {
        const chapters = [];
        document.querySelectorAll('.chapter-input-group').forEach((group) => {
            const start = parseInt(group.querySelector('.chapter-start').value);
            const end = parseInt(group.querySelector('.chapter-end').value);
            if (start && end && start < end) {
                chapters.push({ startPage: start, endPage: end });
            }
        });
        return chapters.sort((a, b) => a.startPage - b.startPage);
    }

    resetBookForm() {
        document.getElementById('edit-book-id').value = '';
        document.getElementById('book-form').reset();
        document.getElementById('chapters-container').innerHTML = '';
        document.getElementById('book-modal-title').textContent = 'Add Book';
    }

    // ──────────────────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────────────────

    render() {
        this.calculateNightlyReading();
        this.renderStats();
        this.renderCurrentlyReading();
        this.renderGenreFilters();
        this.renderBooks('all', 'all');
    }

    renderStats() {
        const stats = this.getStats();
        document.getElementById('stat-days').textContent = stats.daysRemaining;
        document.getElementById('stat-pages').textContent = stats.pagesRemaining.toLocaleString();
        document.getElementById('stat-per-night').textContent = stats.pagesPerNight;
        document.getElementById('stat-books').textContent = stats.booksRemaining;
    }

    renderCurrentlyReading() {
        const container = document.getElementById('current-reading-content');

        if (!this.currentlyReadingBookId) {
            container.innerHTML = `
                <div class="empty-state">
                <p>📚 No book selected for reading yet.</p>
                <p>Choose a book from your library to get started!</p>
                </div>
            `;
            return;
        }

        const book = this.getBook(this.currentlyReadingBookId);
        if (!book) return;

        const progressPercent = (book.currentPage / book.totalPages) * 100;
        const pagesRead = book.currentPage;
        const pagesLeft = book.totalPages - book.currentPage;

        let nightlyInfo = '';
        if (this.nightlyReadingPlan && book.status !== 'completed') {
            const startPage = this.nightlyReadingPlan.startPage;
            const endPage = this.nightlyReadingPlan.endPage;
            const pagesTonight = endPage - startPage;
            nightlyInfo = `
                <div class="progress-item">
                    <div class="progress-label">Tonight's Target: Pages ${startPage} → ${endPage} (${pagesTonight} pages)</div>
                    <button class="btn btn-primary" onclick="tracker.openLogModal()">Log Progress</button>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="current-book-card">
                <div class="current-book-info">
                <h3>${book.title}</h3>
                <p><strong>${book.author || 'Unknown Author'}</strong></p>
                <p>${book.genres.join(', ') || 'No genres'}</p>
                </div>
                <div class="reading-progress">
                <div class="progress-item">
                    <div class="progress-label">Reading Progress</div>
                    <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="progress-text">${pagesRead} / ${book.totalPages} pages</div>
                </div>
                ${nightlyInfo}
                </div>
            </div>
            `;
    }

    renderGenreFilters() {
        const genreContainer = document.getElementById('genre-filter');
        genreContainer.innerHTML = '';

        const allBtn = document.createElement('button');
        allBtn.className = 'filter-pill active';
        allBtn.dataset.genre = 'all';
        allBtn.textContent = 'All Genres';
        genreContainer.appendChild(allBtn);

        const genres = this.getAllGenres();
        genres.forEach((genre) => {
            const btn = document.createElement('button');
            btn.className = 'filter-pill';
            btn.dataset.genre = genre;
            btn.textContent = genre;
            genreContainer.appendChild(btn);
        });

        this.setupFilterListeners();
    }

    renderBooks(statusFilter = 'all', genreFilter = 'all') {
        const booksGrid = document.getElementById('books-grid');
        const books = this.getFilteredBooks(statusFilter, genreFilter);

        if (books.length === 0) {
            booksGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <p>No books found with those filters.</p>
                </div>
            `;
            return;
        }

        booksGrid.innerHTML = books.map((book) => this.createBookCard(book)).join('');

        // Re-attach event listeners for this batch
        document.querySelectorAll('.book-actions button').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    createBookCard(book) {
        const progressPercent = (book.currentPage / book.totalPages) * 100;
        const isCurrentBook = book.id === this.currentlyReadingBookId;
        const isCurrent = isCurrentBook ? 'style="opacity: 1;"' : '';
        const isIgnored =
            book.status === 'ignored'
                ? `
                    style="opacity: 0.5; cursor: not-allowed;"
                `
                : '';

        return `
            <div class="book-card">
            
            <div class="book-cover" ${isIgnored}>📖</div>
                <div class="book-info">
                    <div ${isIgnored}>
                        <div class="book-title">${book.title}</div>
                        <div class="book-author">${book.author || 'Unknown'}</div>
                        <div class="book-genres">
                            ${book.genres.map((g) => `<span class="genre-tag">${g}</span>`).join('')}
                        </div>
                        <div class="book-meta">
                            <span>${book.currentPage} / ${book.totalPages} pages</span>
                            <span class="book-status ${book.status}">${book.status}</span>
                        </div>
                        <div class="progress-bar" style="margin: var(--spacing-md) 0;">
                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>
                    ${
                        book.status !== 'completed'
                            ? `
                    
                        <div class="book-actions">
                            ${
                                // If the book has not been completed yet, show the "Read Now" button
                                book.status !== 'ignored' && !isCurrentBook
                                    ? `
                                    <button class="btn btn-secondary btn-sm" onclick="tracker.setCurrentlyReading('${book.id}')">
                                        Read Now
                                    </button>
                                    `
                                    : ''
                            }

                            <button class="btn btn-ghost btn-sm" onclick="tracker.editBook('${book.id}')">
                                Edit
                            </button>

                            ${
                                // If is the current book, we only want to be able to edit
                                !isCurrentBook && book.status !== 'completed'
                                    ? `
                                        <button class="btn btn-ghost btn-sm" onclick="tracker.ignoreBook('${book.id}', '${book.status}'); tracker.render();">
                                            ${book.status === 'ignored' ? 'Unignore' : 'Ignore'}
                                        </button>
                                        <button class="btn btn-danger btn-sm" onclick="tracker.deleteBook('${book.id}'); tracker.render();">
                                            Delete
                                        </button>
                                        `
                                    : ''
                            }
                        </div>
                        `
                            : ''
                    }
                </div>
            </div>
            `;
    }

    editBook(bookId) {
        const book = this.getBook(bookId);
        if (!book) return;

        document.getElementById('edit-book-id').value = book.id;
        document.getElementById('input-title').value = book.title;
        document.getElementById('input-author').value = book.author;
        document.getElementById('input-genres').value = book.genres.join(', ');
        document.getElementById('input-total-pages').value = book.totalPages;

        // Load chapters
        const chaptersContainer = document.getElementById('chapters-container');
        chaptersContainer.innerHTML = '';
        book.chapters.forEach((chapter) => {
            const group = document.createElement('div');
            group.className = 'chapter-input-group';
            group.innerHTML = `
                <div>
                    <label>Start Page</label>
                    <input type="number" class="chapter-start" value="${chapter.startPage}" min="1">
                </div>
                <div>
                    <label>End Page</label>
                    <input type="number" class="chapter-end" value="${chapter.endPage}" min="1">
                </div>
                <button type="button" class="btn btn-danger btn-sm" onclick="tracker.removeChapterInput(this)">Remove</button>
            `;
            chaptersContainer.appendChild(group);
        });

        document.getElementById('book-modal-title').textContent = 'Edit Book';
        openModal('book-modal-backdrop');
    }

    openLogModal() {
        if (!this.nightlyReadingPlan) return;

        const book = this.getBook(this.nightlyReadingPlan.bookId);
        if (!book) return;

        const modalBody = document.getElementById('log-modal-body');
        const defaultPage = this.nightlyReadingPlan.endPage;

        modalBody.innerHTML = `
            <div class="log-progress-form">
                <p>You're currently on page <strong>${book.currentPage}</strong> of <strong>${book.title}</strong>.</p>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">Tonight's goal: pages ${this.nightlyReadingPlan.startPage} → ${this.nightlyReadingPlan.endPage}</p>
                
                <label for="log-page-input">What page did you reach?</label>
                <input 
                type="number" 
                id="log-page-input" 
                value="${defaultPage}" 
                min="${book.currentPage}" 
                max="${book.totalPages}"
                placeholder="Page number"
                >
                
                <div class="log-actions">
                    <button type="button" class="btn btn-ghost" onclick="closeModal('log-modal-backdrop')">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="tracker.submitProgress()">Update Progress</button>
                </div>
            </div>
        `;

        openModal('log-modal-backdrop');
        document.getElementById('log-page-input').focus();
    }

    submitProgress() {
        const pageInput = document.getElementById('log-page-input');
        const page = parseInt(pageInput.value);
        const book = this.getBook(this.nightlyReadingPlan.bookId);

        if (!book || isNaN(page) || page < book.currentPage || page > book.totalPages) {
            alert('Please enter a valid page number');
            return;
        }

        this.logProgress(this.nightlyReadingPlan.bookId, page);
        closeModal('log-modal-backdrop');
        showToast(`Progress updated! ${page} / ${book.totalPages} pages`);
        this.render();
    }

    // ──────────────────────────────────────────────────────────
    // Import / Export
    // ──────────────────────────────────────────────────────────

    exportData() {
        const exportObject = {
            version: 1,
            exportedAt: new Date().toISOString(),

            books: this.books,
            currentlyReadingBookId: this.currentlyReadingBookId,
            targetDate: this.targetDate,
            nightlyReadingPlan: this.nightlyReadingPlan,
        };

        const blob = new Blob([JSON.stringify(exportObject, null, 2)], {
            type: 'application/json',
        });

        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `reading-tracker-${new Date().toISOString().slice(0, 10)}.json`;

        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);

        showToast('Data exported successfully');
    }

    async importData(file, mode = 'merge') {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!Array.isArray(data.books)) {
                throw new Error('Invalid backup file');
            }

            if (mode === 'override') {
                this.books = data.books || [];
                this.currentlyReadingBookId = data.currentlyReadingBookId || null;
                this.targetDate = data.targetDate || this.targetDate;
                this.nightlyReadingPlan = data.nightlyReadingPlan || null;
            } else {
                const existingBooks = new Map(this.books.map((b) => [b.id, b]));

                for (const importedBook of data.books || []) {
                    const existing = existingBooks.get(importedBook.id);

                    if (!existing) {
                        this.books.push(importedBook);
                        continue;
                    }

                    // Keep whichever version has more progress

                    if (importedBook.currentPage > existing.currentPage) {
                        Object.assign(existing, importedBook);
                    }
                }
            }

            this.saveBooks();
            this.saveCurrentBook();
            this.saveTargetDate();
            this.saveNightlyPlan();

            this.render();

            showToast(
                mode === 'override' ? 'Data replaced successfully' : 'Data merged successfully',
            );
        } catch (error) {
            console.error(error);
            alert('Unable to import file');
        }
    }
}

// ──────────────────────────────────────────────────────────
// UI Utilities
// ──────────────────────────────────────────────────────────

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ──────────────────────────────────────────────────────────
// Initialize Application
// ──────────────────────────────────────────────────────────

let tracker;

document.addEventListener('DOMContentLoaded', () => {
    tracker = new ReadingTracker();

    tracker.render();

    // Close modal on backdrop click
    document.getElementById('book-modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'book-modal-backdrop') {
            closeModal('book-modal-backdrop');
        }
    });

    document.getElementById('log-modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'log-modal-backdrop') {
            closeModal('log-modal-backdrop');
        }
    });
});

// Export button
document.getElementById('export-data-btn').addEventListener('click', () => {
    tracker.exportData();
});

// Import button
document.getElementById('import-data-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
});

// Import file selection
document.getElementById('import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const override = confirm(
        'Press OK to OVERRIDE all existing data.\n\nPress Cancel to MERGE imported books into existing data.',
    );

    await tracker.importData(file, override ? 'override' : 'merge');

    e.target.value = '';
});
