document.addEventListener('DOMContentLoaded', () => {
    const SERVER_URL = 'http://localhost:5000';

    // DOM Elements for Login Page
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginButton = document.getElementById('loginButton');
    const regUsernameInput = document.getElementById('regUsername');
    const regPasswordInput = document.getElementById('regPassword');
    const registerButton = document.getElementById('registerButton');
    const authStatusLogin = document.getElementById('authStatusLogin'); // New status element for login
    const authStatusRegister = document.getElementById('authStatusRegister'); // New status element for register

    const showRegisterFormLink = document.getElementById('showRegisterForm');
    const showLoginFormLink = document.getElementById('showLoginForm');
    
    const loginFormFace = document.getElementById('loginFormFace');
    const registerFormFace = document.getElementById('registerFormFace');
    const authCard = document.querySelector('.auth-card');


    // --- Utility Functions ---
    function showStatus(element, message, type) {
        element.textContent = message;
        element.className = `status-message ${type}`;
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status-message';
        }, 5000);
    }

    async function apiRequest(endpoint, method = 'GET', body = null) {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include' // Important for sending cookies (session ID)
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${SERVER_URL}${endpoint}`, options);
            const data = await response.json();
            return { ok: response.ok, data: data, status: response.status };
        } catch (error) {
            console.error(`API Request to ${endpoint} failed:`, error);
            return { ok: false, data: { status: 'error', message: `Network error: ${error.message}` }, status: 500 };
        }
    }

    // --- Authentication Logic ---

    registerButton.addEventListener('click', async () => {
        const username = regUsernameInput.value;
        const password = regPasswordInput.value;
        showStatus(authStatusRegister, 'Registering...', 'info'); // Use register status
        const result = await apiRequest('/register', 'POST', { username, password });
        if (result.ok) {
            showStatus(authStatusRegister, result.data.message, 'success');
            regUsernameInput.value = '';
            regPasswordInput.value = '';
            // After successful registration, flip back to login form
            showLoginForm(); // Call function to show login form
        } else {
            showStatus(authStatusRegister, result.data.message, 'error');
        }
    });

    loginButton.addEventListener('click', async () => {
        const username = loginUsernameInput.value;
        const password = loginPasswordInput.value;

        // Basic client-side validation
        if (!username || !password) {
            showStatus(authStatusLogin, 'Please enter both username and password.', 'error');
            return;
        }

        showStatus(authStatusLogin, 'Logging in...', 'info'); // Use login status
        const result = await apiRequest('/login', 'POST', { username, password });
        if (result.ok) {
            showStatus(authStatusLogin, result.data.message, 'success');
            // Redirect to main app page upon successful login
            window.location.href = '/'; 
        } else {
            showStatus(authStatusLogin, result.data.message, 'error');
        }
    });

    // --- Form Flip Animation ---
    function showRegisterForm() {
        authCard.classList.add('flipped');
        loginFormFace.style.opacity = '0';
        registerFormFace.style.opacity = '1';
        authStatusLogin.textContent = ''; // Clear status message on switch
        authStatusRegister.textContent = '';
    }

    function showLoginForm() {
        authCard.classList.remove('flipped');
        loginFormFace.style.opacity = '1';
        registerFormFace.style.opacity = '0';
        authStatusLogin.textContent = ''; // Clear status message on switch
        authStatusRegister.textContent = '';
    }

    showRegisterFormLink.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterForm();
    });

    showLoginFormLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });

    // Initial state: ensure login form is visible and register form is hidden/flipped
    // Set initial opacity to manage visibility during animation
    loginFormFace.style.transition = 'opacity 0.6s ease-in-out';
    registerFormFace.style.transition = 'opacity 0.6s ease-in-out';
    loginFormFace.style.opacity = '1';
    registerFormFace.style.opacity = '0'; // Ensure register face is hidden initially
});