(function () {
    // Inject Modal HTML if not present
    if (!document.getElementById('customModal')) {
        const modalHTML = `
            <div id="customModal" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-icon" id="modalIcon"></div>
                    <h3 class="modal-title" id="modalTitle"></h3>
                    <p class="modal-message" id="modalMessage"></p>
                    
                    <div id="modalInputContainer" style="display:none; margin-bottom: 1.5rem;">
                        <input type="text" id="modalInput" class="form-input" style="width:100%; padding:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border-soft); color:white; border-radius:8px;">
                    </div>

                    <div style="display:flex; gap:1rem; justify-content:center;">
                        <button id="modalCancelBtn" class="btn btn-ghost" onclick="closeModal()" style="display:none; flex:1;">Zrušit</button>
                        <button id="modalOkBtn" class="btn btn-primary" style="flex:1;">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    let modalCallback = null; // Called on OK
    let modalCancelCallback = null; // Called on Cancel (optional)

    // Helper to reset modal state
    function resetModal() {
        document.getElementById('modalInputContainer').style.display = 'none';
        document.getElementById('modalCancelBtn').style.display = 'none';
        document.getElementById('modalOkBtn').innerText = 'OK';
        document.getElementById('modalOkBtn').onclick = handleOk;
        modalCallback = null;
        modalCancelCallback = null;
    }

    function handleOk() {
        const inputVal = document.getElementById('modalInput').value;
        closeModal();
        if (modalCallback) {
            modalCallback(inputVal);
        }
    }

    window.closeModal = function () {
        const modal = document.getElementById('customModal');
        modal.classList.remove('active');
        // If there was a cancel callback and we are closing without OK (this logic is simplified, actually closeModal is called by Cancel btn too)
        // But for simple "alert", OK runs close.
    };

    window.showModal = function (title, message, type = 'info', callback = null) {
        resetModal();

        const modal = document.getElementById('customModal');
        const iconContainer = document.getElementById('modalIcon');
        const titleEl = document.getElementById('modalTitle');
        const msgEl = document.getElementById('modalMessage');

        modalCallback = callback;

        titleEl.textContent = title;
        msgEl.innerHTML = message; // Use innerHTML for <br>

        // Icons
        let iconSvg = '';
        let iconColor = 'var(--text-primary)';

        if (type === 'success') {
            iconColor = 'var(--accent)';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="${iconColor}" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>`;
        } else if (type === 'error') {
            iconColor = 'var(--danger)';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="${iconColor}" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>`;
        } else {
            if (type === 'warning') iconColor = '#fbbf24';
            else iconColor = '#60a5fa';

            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="${iconColor}" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>`;
        }

        iconContainer.innerHTML = iconSvg;
        iconContainer.style.background = type === 'success' ? 'rgba(124, 242, 107, 0.1)' :
            type === 'error' ? 'rgba(248, 113, 113, 0.1)' :
                'rgba(255, 255, 255, 0.05)';

        modal.classList.add('active');
    };

    window.showConfirm = function (title, message, onConfirm) {
        window.showModal(title, message, 'warning', onConfirm);
        document.getElementById('modalCancelBtn').style.display = 'block';
        document.getElementById('modalOkBtn').innerText = 'Potvrdit';
    };

    window.showPrompt = function (title, message, defaultValue, onInput) {
        window.showModal(title, message, 'info', onInput);
        document.getElementById('modalCancelBtn').style.display = 'block';
        const inputContainer = document.getElementById('modalInputContainer');
        const input = document.getElementById('modalInput');

        inputContainer.style.display = 'block';
        input.value = defaultValue || '';
        input.focus();
    };

    // Close on Escape
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            const modal = document.getElementById('customModal');
            if (modal && modal.classList.contains('active')) {
                closeModal();
            }
        }
    });

})();
