import os
import hashlib
from flask import Flask, request, jsonify, send_from_directory, make_response, redirect, url_for, session
from werkzeug.utils import secure_filename
import time
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_socketio import SocketIO, emit, join_room, leave_room
import eventlet # Recommended for Flask-SocketIO production deployment

# --- Configuration ---
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'rar', 'doc', 'docx', 'xls', 'xlsx'}
DATABASE_FILE = 'site.db'
HOST = '0.0.0.0'
PORT = 5000

# --- Flask App Setup ---
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 MB max upload size
app.config['SECRET_KEY'] = 'your_super_secret_key_change_this_in_production' # VERY IMPORTANT: Change this!
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DATABASE_FILE}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app, supports_credentials=True, expose_headers=['X-SHA256']) # Enable CORS for all routes and expose custom header

# --- Database & Login Manager ---
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'serve_login_page' # Redirect unauthorized users to the login page

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet') # Use eventlet for async

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- Database Models ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    files_uploaded = db.relationship('File', backref='uploader', lazy=True)
    shared_files_received = db.relationship('SharedFile', foreign_keys='SharedFile.receiver_id', backref='receiver', lazy=True)
    shared_files_sent = db.relationship('SharedFile', foreign_keys='SharedFile.sender_id', backref='sender', lazy=True)

    def set_password(self, password):
        self.password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()

    def check_password(self, password):
        return self.password_hash == hashlib.sha256(password.encode('utf-8')).hexdigest()

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username
        }

class File(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False) # Stored filename
    original_filename = db.Column(db.String(255), nullable=False) # Original filename from user
    sha256 = db.Column(db.String(64), nullable=False)
    uploader_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    upload_timestamp = db.Column(db.Integer, default=lambda: int(time.time())) # Store as Unix timestamp

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.original_filename, # Show original filename to client
            'stored_filename': self.filename,    # Actual filename on server
            'sha256': self.sha256,
            'uploader_id': self.uploader_id,
            'uploader_username': self.uploader.username,
            'upload_timestamp': self.upload_timestamp
        }

class SharedFile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('file.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    share_timestamp = db.Column(db.Integer, default=lambda: int(time.time()))

    file = db.relationship('File', backref='shared_instances', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'file_id': self.file_id,
            'file_info': self.file.to_dict(), # Include file details
            'sender_id': self.sender_id,
            'sender_username': self.sender.username,
            'receiver_id': self.receiver_id,
            'receiver_username': self.receiver.username,
            'share_timestamp': self.share_timestamp
        }


# --- Login Manager Callbacks ---
@login_manager.user_loader
def load_user(user_id):
    # Suppress SQLAlchemy 2.0 warning about Query.get()
    import warnings
    from sqlalchemy.exc import LegacyAPIWarning
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', LegacyAPIWarning)
        return User.query.get(int(user_id))

# Handle unauthorized access - redirect to login page
@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api'): # For API calls, return 401
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    return redirect(url_for('serve_login_page'))


# --- Helper Functions ---
def allowed_file(filename):
    """Checks if the file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def calculate_sha256(filepath):
    """Calculates the SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except FileNotFoundError:
        print(f"Error: File not found for SHA-256 calculation: {filepath}")
        return None
    except Exception as e:
        print(f"Error calculating SHA-256 for {filepath}: {e}")
        return None

# --- Auth Routes ---
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"status": "error", "message": "Username and password are required"}), 400

    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({"status": "error", "message": "Username already exists"}), 409

    new_user = User(username=username)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"status": "success", "message": "Registration successful"}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        login_user(user)
        return jsonify({"status": "success", "message": "Login successful", "user": user.to_dict()}), 200
    else:
        return jsonify({"status": "error", "message": "Invalid username or password"}), 401

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"status": "success", "message": "Logged out successfully"}), 200

@app.route('/get_current_user', methods=['GET'])
@login_required
def get_current_user():
    return jsonify({"status": "success", "user": current_user.to_dict()}), 200

@app.route('/users', methods=['GET'])
@login_required
def get_all_users():
    users = User.query.filter(User.id != current_user.id).all() # Exclude current user
    return jsonify({"status": "success", "users": [user.to_dict() for user in users]}), 200

# --- File Operations Routes ---
@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400
    if file and allowed_file(file.filename):
        original_filename = secure_filename(file.filename)
        # Add timestamp and user ID to stored filename to prevent overwrites and ensure uniqueness
        name, ext = os.path.splitext(original_filename)
        stored_filename = f"{current_user.id}_{name}_{int(time.time())}{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], stored_filename)
        
        try:
            file.save(filepath)
            calculated_hash = calculate_sha256(filepath)
            
            if calculated_hash:
                new_file = File(
                    filename=stored_filename,
                    original_filename=original_filename,
                    sha256=calculated_hash,
                    uploader_id=current_user.id
                )
                db.session.add(new_file)
                db.session.commit()
                
                # Corrected SocketIO emit: removed broadcast=True keyword argument.
                socketio.emit('new_file_uploaded', {'file': new_file.to_dict(), 'uploader': current_user.username})

                return jsonify({
                    "status": "success", 
                    "message": "File uploaded successfully", 
                    "filename": original_filename,
                    "stored_filename": stored_filename,
                    "sha256": calculated_hash,
                    "file_id": new_file.id
                }), 200
            else:
                return jsonify({"status": "warning", "message": "File uploaded, but failed to calculate SHA-256 hash", "filename": original_filename}), 200
        except Exception as e:
            print(f"Server error during upload: {e}")
            return jsonify({"status": "error", "message": f"File upload failed: {str(e)}"}), 500
    else:
        return jsonify({"status": "error", "message": "File type not allowed"}), 400

@app.route('/download/<stored_filename>', methods=['GET'])
@login_required
def download_file(stored_filename):
    """
    Handles file downloads. Access to files is now based on stored_filename.
    Client must have access to this file (either uploaded by them or shared with them).
    """
    file_record = File.query.filter_by(filename=stored_filename).first()
    if not file_record:
        return jsonify({"status": "error", "message": "File not found in database"}), 404

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], stored_filename)

    # Check if current user is the uploader OR if file has been shared with current user
    if file_record.uploader_id != current_user.id:
        shared_entry = SharedFile.query.filter_by(
            file_id=file_record.id,
            receiver_id=current_user.id
        ).first()
        if not shared_entry:
            return jsonify({"status": "error", "message": "Access denied. File not uploaded by you or shared with you."}), 403

    if os.path.exists(filepath):
        try:
            calculated_hash = calculate_sha256(filepath)
            response = make_response(send_from_directory(app.config['UPLOAD_FOLDER'], stored_filename, as_attachment=True, download_name=file_record.original_filename))
            if calculated_hash:
                response.headers['X-SHA256'] = calculated_hash
            return response
        except Exception as e:
            print(f"Server error during download: {e}")
            return jsonify({"status": "error", "message": f"File download failed: {str(e)}"}), 500
    else:
        return jsonify({"status": "error", "message": "Physical file not found on server"}), 404


@app.route('/my_files', methods=['GET'])
@login_required
def my_files():
    """Lists files uploaded by the current user."""
    files = File.query.filter_by(uploader_id=current_user.id).all()
    return jsonify({"status": "success", "files": [f.to_dict() for f in files]}), 200

@app.route('/shared_files', methods=['GET'])
@login_required
def shared_files():
    """Lists files shared with the current user."""
    shared_entries = SharedFile.query.filter_by(receiver_id=current_user.id).all()
    files = [entry.to_dict() for entry in shared_entries] # Use to_dict from SharedFile
    return jsonify({"status": "success", "files": files}), 200

@app.route('/share_file', methods=['POST'])
@login_required
def share_file():
    data = request.get_json()
    file_id = data.get('file_id')
    receiver_username = data.get('receiver_username')

    if not file_id or not receiver_username:
        return jsonify({"status": "error", "message": "File ID and receiver username are required"}), 400

    file_to_share = File.query.get(file_id)
    if not file_to_share:
        return jsonify({"status": "error", "message": "File not found"}), 404
    
    # Ensure the current user is the uploader of the file
    if file_to_share.uploader_id != current_user.id:
        return jsonify({"status": "error", "message": "You can only share files you have uploaded"}), 403

    receiver_user = User.query.filter_by(username=receiver_username).first()
    if not receiver_user:
        return jsonify({"status": "error", "message": "Receiver user not found"}), 404
    
    if receiver_user.id == current_user.id:
        return jsonify({"status": "error", "message": "Cannot share a file with yourself"}), 400

    # Check if already shared
    existing_share = SharedFile.query.filter_by(
        file_id=file_id,
        sender_id=current_user.id,
        receiver_id=receiver_user.id
    ).first()

    if existing_share:
        return jsonify({"status": "warning", "message": "File already shared with this user"}), 200 # Or 409 Conflict

    new_share = SharedFile(
        file_id=file_id,
        sender_id=current_user.id,
        receiver_id=receiver_user.id
    )
    db.session.add(new_share)
    db.session.commit()

    # Emit socket event to the receiver that a file has been shared with them
    socketio.emit('file_shared_with_me', {
        'file_id': file_id,
        'file_info': file_to_share.to_dict(),
        'sender_username': current_user.username
    }, room=f'user_{receiver_user.id}')

    return jsonify({"status": "success", "message": f"File '{file_to_share.original_filename}' shared with '{receiver_username}'"}), 200


# --- SocketIO Events ---
@socketio.on('connect')
@login_required # Ensure user is logged in before connecting to socket
def handle_connect():
    print(f"Client connected: {request.sid} (User ID: {current_user.id}, Username: {current_user.username})")
    join_room(f'user_{current_user.id}') # Join a unique room for this user
    emit('my_response', {'data': 'Connected to server', 'user': current_user.to_dict()})

@socketio.on('disconnect')
def handle_disconnect():
    if current_user.is_authenticated:
        # Check if the room exists before trying to leave - robustness
        if f'user_{current_user.id}' in socketio.manager.rooms['/']: # Check if room exists in default namespace
             leave_room(f'user_{current_user.id}')
        print(f"Client disconnected: {request.sid} (User ID: {current_user.id}, Username: {current_user.username})")
    else:
        print(f"Client disconnected: {request.sid} (Anonymous user)")


# --- Static File Serving (for client) ---
@app.route('/')
@login_required # Protect the main app page
def serve_main_app():
    # If logged in, serve the main app (index.html)
    return send_from_directory('client', 'index.html')

@app.route('/login_page') # New route for login page
def serve_login_page():
    # If already logged in, redirect to main app
    if current_user.is_authenticated:
        return redirect(url_for('serve_main_app'))
    return send_from_directory('client', 'login.html') # Serve the new login.html

@app.route('/<path:path>')
def serve_static(path):
    # Prevent directory traversal attacks
    if '..' in path or path.startswith('/'):
        return "Forbidden", 403
    # Serve static files from 'client' folder for both main app and login page
    return send_from_directory('client', path)

# --- Main Execution ---
if __name__ == '__main__':
    # Initialize database
    with app.app_context():
        db.create_all()
        print("Database initialized or already exists.")

    print(f"Flask server running on http://{HOST}:{PORT}")
    socketio.run(app, host=HOST, port=PORT, debug=True, allow_unsafe_werkzeug=True)