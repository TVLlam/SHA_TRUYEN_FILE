document.addEventListener('DOMContentLoaded', () => {
    const SERVER_URL = 'http://localhost:5000';
    let currentUser = null; // Store current logged-in user info
    let socket; // WebSocket instance

    // --- DOM Elements (Main App) ---
    const usernameDisplay = document.getElementById('usernameDisplay');
    const logoutButton = document.getElementById('logoutButton');
    
    const fileInput = document.getElementById('fileInput');
    const uploadButton = document.getElementById('uploadButton');
    const uploadStatus = document.getElementById('uploadStatus');
    const myFilesList = document.getElementById('myFilesList');

    const shareFileSelect = document.getElementById('shareFileSelect');
    const shareUserSelect = document.getElementById('shareUserSelect');
    const shareButton = document.getElementById('shareButton');
    const shareStatus = document.getElementById('shareStatus');

    const sharedFilesList = document.getElementById('sharedFilesList');
    const downloadFileSelect = document.getElementById('downloadFileSelect');
    const downloadButton = document.getElementById('downloadButton');
    const downloadStatus = document.getElementById('downloadStatus');
    const downloadHashDisplay = document.getElementById('downloadHash');
    const clientHashDisplay = document.getElementById('clientHash');
    const integrityStatus = document.getElementById('integrityStatus');

    // --- Utility Functions ---
    function showStatus(element, message, type) {
        element.textContent = message;
        element.className = `status-message ${type}`;
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status-message';
        }, 5000);
    }

    async function calculateFileHash(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const buffer = e.target.result;
                const hash = sha256(new Uint8Array(buffer));
                resolve(hash);
            };
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    // --- API Calls ---

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
            // If the server redirects to login page, handle it
            if (response.redirected && response.url.includes('/login_page')) {
                window.location.href = response.url; // Redirect browser
                return { ok: false, data: { status: 'error', message: 'Redirected to login' }, status: 302 };
            }
            const data = await response.json();
            return { ok: response.ok, data: data, status: response.status };
        } catch (error) {
            console.error(`API Request to ${endpoint} failed:`, error);
            return { ok: false, data: { status: 'error', message: `Network error: ${error.message}` }, status: 500 };
        }
    }

    async function checkLoginStatus() {
        const result = await apiRequest('/get_current_user', 'GET');
        if (result.ok) {
            currentUser = result.data.user;
            usernameDisplay.textContent = currentUser.username;
            // Now that user is logged in, fetch data
            fetchMyFiles();
            fetchSharedFiles();
            fetchUsersForSharing();
            populateDownloadSelect(); // Populate combined download list
            connectWebSocket(); // Connect WebSocket after login
        } else {
            // Not logged in or session expired, redirect to login page
            window.location.href = '/login_page';
        }
    }

    async function fetchMyFiles() {
        const result = await apiRequest('/my_files');
        myFilesList.innerHTML = ''; // Clear existing list
        shareFileSelect.innerHTML = '<option value="">Select your file to share</option>'; // Clear for refresh
        if (result.ok && result.data.files.length > 0) {
            result.data.files.forEach(file => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <strong>${file.filename}</strong> (You uploaded)<br>
                    <span>Size: ${(file.size / 1024).toFixed(2)} KB</span><br>
                    <span>SHA-256: ${file.sha256}</span>
                `;
                myFilesList.appendChild(listItem);

                // Add to share dropdown
                const option = document.createElement('option');
                option.value = file.id; // Use file ID for sharing
                option.textContent = file.filename;
                shareFileSelect.appendChild(option);
            });
        } else {
            myFilesList.innerHTML = '<li>No files uploaded yet.</li>';
        }
        updateShareButtonState();
    }

    async function fetchSharedFiles() {
        const result = await apiRequest('/shared_files');
        sharedFilesList.innerHTML = ''; // Clear existing list
        if (result.ok && result.data.files.length > 0) {
            result.data.files.forEach(shareEntry => {
                const file = shareEntry.file_info; // Get the actual file info from the shared_entry
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <strong>${file.filename}</strong> (From: ${shareEntry.sender_username})<br>
                    <span>Size: ${(file.size / 1024).toFixed(2)} KB</span><br>
                    <span>SHA-256: ${file.sha256}</span>
                    <button class="download-shared-button" data-stored-filename="${file.stored_filename}" data-original-filename="${file.filename}"><i class="fas fa-download"></i> Download</button>
                `;
                sharedFilesList.appendChild(listItem);
            });
            // Add event listeners for new download buttons on shared files
            document.querySelectorAll('.download-shared-button').forEach(button => {
                button.onclick = (e) => {
                    downloadFile(e.target.dataset.storedFilename, e.target.dataset.originalFilename);
                };
            });
        } else {
            sharedFilesList.innerHTML = '<li>No files shared with you.</li>';
        }
    }

    async function fetchUsersForSharing() {
        const result = await apiRequest('/users');
        shareUserSelect.innerHTML = '<option value="">Select user to share with</option>'; // Clear for refresh
        if (result.ok && result.data.users.length > 0) {
            result.data.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.username; // Use username for sharing
                option.textContent = user.username;
                shareUserSelect.appendChild(option);
            });
        }
        updateShareButtonState();
    }

    async function populateDownloadSelect() {
        downloadFileSelect.innerHTML = '<option value="">Select a file to download</option>';
        downloadButton.disabled = true;

        const myFilesResult = await apiRequest('/my_files');
        const sharedFilesResult = await apiRequest('/shared_files');

        let allDownloadableFiles = [];

        if (myFilesResult.ok && myFilesResult.data.files.length > 0) {
            myFilesResult.data.files.forEach(file => {
                allDownloadableFiles.push({
                    stored_filename: file.stored_filename,
                    original_filename: file.filename,
                    display_name: `[My file] ${file.filename}`
                });
            });
        }
        if (sharedFilesResult.ok && sharedFilesResult.data.files.length > 0) {
            sharedFilesResult.data.files.forEach(shareEntry => {
                const file = shareEntry.file_info;
                allDownloadableFiles.push({
                    stored_filename: file.stored_filename,
                    original_filename: file.filename,
                    display_name: `[Shared by ${shareEntry.sender_username}] ${file.filename}`
                });
            });
        }

        allDownloadableFiles.forEach(file => {
            const option = document.createElement('option');
            option.value = file.stored_filename;
            option.textContent = file.display_name;
            downloadFileSelect.appendChild(option);
        });

        downloadFileSelect.addEventListener('change', () => {
            downloadButton.disabled = !downloadFileSelect.value;
            downloadStatus.textContent = '';
            downloadHashDisplay.textContent = '';
            clientHashDisplay.textContent = '';
            integrityStatus.textContent = '';
        });
    }

    function updateShareButtonState() {
        const fileSelected = shareFileSelect.value !== '';
        const userSelected = shareUserSelect.value !== '';
        shareButton.disabled = !(fileSelected && userSelected);
    }


    // --- Event Listeners ---

    logoutButton.addEventListener('click', async () => {
        const result = await apiRequest('/logout', 'POST');
        if (result.ok) {
            // Redirect to login page after logout
            window.location.href = '/login_page';
        } else {
            alert('Logout failed. Please try again.'); // Simple alert for logout failure
        }
    });

    uploadButton.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            showStatus(uploadStatus, 'Please select a file first.', 'error');
            return;
        }

        showStatus(uploadStatus, 'Uploading...', 'info');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${SERVER_URL}/upload`, {
                method: 'POST',
                body: formData,
                credentials: 'include' // Important for sending cookies (session ID)
            });

            if (!response.ok) {
                const errorData = await response.json();
                showStatus(uploadStatus, `Upload failed: ${errorData.message}`, 'error');
                return;
            }

            const data = await response.json();

            if (data.status === 'success') {
                showStatus(uploadStatus, `Upload successful! Server SHA-256: ${data.sha256}`, 'success');
                fetchMyFiles(); // Refresh my uploaded files
                populateDownloadSelect(); // Update combined download select list
            } else if (data.status === 'warning') {
                 showStatus(uploadStatus, `Upload successful with warning: ${data.message}`, 'warning');
                 fetchMyFiles();
                 populateDownloadSelect();
            }
            else {
                showStatus(uploadStatus, `Upload failed: ${data.message}`, 'error');
            }
        } catch (error) {
            showStatus(uploadStatus, `Network error during upload: ${error.message}`, 'error');
        }
    });

    shareFileSelect.addEventListener('change', updateShareButtonState);
    shareUserSelect.addEventListener('change', updateShareButtonState);

    shareButton.addEventListener('click', async () => {
        const fileId = shareFileSelect.value;
        const receiverUsername = shareUserSelect.value;

        if (!fileId || !receiverUsername) {
            showStatus(shareStatus, 'Please select both a file and a user.', 'error');
            return;
        }

        showStatus(shareStatus, 'Sharing file...', 'info');
        const result = await apiRequest('/share_file', 'POST', { file_id: parseInt(fileId), receiver_username: receiverUsername });
        if (result.ok) {
            showStatus(shareStatus, result.data.message, 'success');
            // Optionally clear selections after successful share
            shareFileSelect.value = '';
            shareUserSelect.value = '';
            updateShareButtonState();
        } else {
            showStatus(shareStatus, result.data.message, 'error');
        }
    });

    downloadButton.addEventListener('click', async () => {
        const storedFilename = downloadFileSelect.value;
        if (!storedFilename) {
            showStatus(downloadStatus, 'Please select a file to download.', 'error');
            return;
        }

        // The populateDownloadSelect already puts the original filename in the option text
        const selectedOptionText = downloadFileSelect.options[downloadFileSelect.selectedIndex].textContent;
        // Example: "[My file] MyDocument.pdf" or "[Shared by user1] AnotherDoc.docx"
        const originalFilenameMatch = selectedOptionText.match(/\[.*?\]\s*(.*)/); 
        const originalFilename = originalFilenameMatch ? originalFilenameMatch[1].trim() : storedFilename;

        await downloadFile(storedFilename, originalFilename);
    });

    async function downloadFile(storedFilename, originalFilenameForClientSave) {
        showStatus(downloadStatus, 'Downloading...', 'info');
        downloadHashDisplay.textContent = '';
        clientHashDisplay.textContent = '';
        integrityStatus.textContent = '';

        try {
            const response = await fetch(`${SERVER_URL}/download/${storedFilename}`, {
                credentials: 'include' // Important for sending cookies (session ID)
            });

            if (!response.ok) {
                const errorData = await response.json();
                showStatus(downloadStatus, `Download failed: ${errorData.message}`, 'error');
                return;
            }

            const serverHash = response.headers.get('x-sha256');
            const blob = await response.blob();
            const downloadedFile = new File([blob], originalFilenameForClientSave, { type: blob.type });

            showStatus(downloadStatus, 'File downloaded. Calculating client hash...', 'info');
            downloadHashDisplay.textContent = `Server SHA-256: ${serverHash || 'N/A (Server header missing or not exposed)'}`;

            const clientHash = await calculateFileHash(downloadedFile);
            clientHashDisplay.textContent = `Client SHA-256: ${clientHash}`;

            if (serverHash && clientHash === serverHash) {
                showStatus(integrityStatus, 'Integrity Check: MATCH! File is intact.', 'success');
            } else if (serverHash) {
                showStatus(integrityStatus, 'Integrity Check: MISMATCH! File might be corrupted.', 'error');
            } else {
                showStatus(integrityStatus, 'Integrity Check: Server hash not provided.', 'warning');
            }

            // Trigger browser download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = originalFilenameForClientSave;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

        } catch (error) {
            showStatus(downloadStatus, `Network error during download: ${error.message}`, 'error');
            integrityStatus.textContent = '';
        }
    }


    // --- WebSocket (SocketIO) Setup ---
    function connectWebSocket() {
        if (socket && socket.connected) {
            console.log("Socket already connected.");
            return;
        }
        socket = io(SERVER_URL, {
            autoConnect: false, // Don't auto-connect on page load
            withCredentials: true // Send cookies with WebSocket handshake
        });

        socket.on('connect', () => {
            console.log('Socket.IO connected!');
        });

        socket.on('disconnect', () => {
            console.log('Socket.IO disconnected!');
        });

        socket.on('my_response', (data) => {
            console.log('Received from server:', data);
        });

        // Event for when a new file is uploaded by anyone (broadcasting)
        socket.on('new_file_uploaded', (data) => {
            console.log('New file uploaded notification:', data);
            populateDownloadSelect(); // Update download list for all.
        });

        // Event for when a file is specifically shared with *this* user
        socket.on('file_shared_with_me', (data) => {
            console.log('File shared with me notification:', data);
            showStatus(document.querySelector('.header'), `New file "${data.file_info.filename}" shared by ${data.sender_username}!`, 'success');
            fetchSharedFiles(); // Refresh shared files list
            populateDownloadSelect(); // Update download list
        });

        // Connect the socket
        socket.connect();
    }


    // --- Initial Load ---
    checkLoginStatus(); // Check if user is already logged in on page load
});