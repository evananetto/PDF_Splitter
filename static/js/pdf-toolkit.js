// PDF Toolkit - Base Shared JavaScript
const PDFToolkit = (function() {
    'use strict';

    // Shared state
    const state = {
        toastTimer: null
    };

    // DOM elements cache for shared components
    const elements = {
        toast: null,
        toastTitle: null,
        toastMessage: null
    };

    // ==================== TOAST NOTIFICATIONS ====================
    function showToast(title, message, type = 'info', duration = 4000) {
        if (elements.toast) {
            if (state.toastTimer) {
                clearTimeout(state.toastTimer);
                state.toastTimer = null;
            }
            
            elements.toast.className = 'toast-notification';
            elements.toast.classList.add(type);
            elements.toastTitle.textContent = title;
            elements.toastMessage.textContent = message;
            
            setTimeout(() => {
                elements.toast.classList.add('show');
            }, 10);
            
            state.toastTimer = setTimeout(() => {
                closeToast();
            }, duration);
        }
    }

    function closeToast() {
        if (elements.toast) {
            elements.toast.classList.remove('show');
            if (state.toastTimer) {
                clearTimeout(state.toastTimer);
                state.toastTimer = null;
            }
        }
    }

    // ==================== INITIALIZATION ====================
    function init() {
        // Cache shared DOM elements
        elements.toast = document.getElementById('toast-notification');
        elements.toastTitle = document.getElementById('toast-title');
        elements.toastMessage = document.getElementById('toast-message');
        
        console.log('PDF Toolkit Base initialized successfully');
    }

    // Public API - expose to global scope
    const publicAPI = {
        init: init,
        showToast: showToast,
        closeToast: closeToast,
        getToastElements: function() {
            return elements;
        }
    };

    // Expose to global scope
    window.PDFToolkit = publicAPI;

    return publicAPI;

})();

// Initialize base when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.PDFToolkit) {
        window.PDFToolkit.init();
    }
});