import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from config import Config
from routes.chat_routes import chat_bp
from routes.faq_routes import faq_bp
from utils.logger import logger
from services.faq_service import faq_service

def create_app() -> Flask:
    """Application factory for AskSphere AI Flask API."""
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
    app = Flask(__name__, static_folder=frontend_dir, static_url_path="")
    app.config.from_object(Config)

    # Enable CORS for all routes (supports development on localhost:5173, etc.)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Register API blueprints
    app.register_blueprint(chat_bp)
    app.register_blueprint(faq_bp)

    @app.route("/")
    def serve_index():
        if os.path.exists(os.path.join(frontend_dir, "index.html")):
            return send_from_directory(frontend_dir, "index.html")
        return jsonify({"message": "AskSphere AI API is running", "docs": "/api/health"})

    @app.route("/<path:path>")
    def serve_static_file(path):
        target = os.path.join(frontend_dir, path)
        if os.path.exists(target) and not os.path.isdir(target):
            return send_from_directory(frontend_dir, path)
        if os.path.exists(os.path.join(frontend_dir, "index.html")):
            return send_from_directory(frontend_dir, "index.html")
        return jsonify({"success": False, "error": "Resource not found."}), 404

    @app.errorhandler(404)
    def handle_not_found(e):
        return jsonify({
            "success": False,
            "error": "The requested resource was not found on this server."
        }), 404

    @app.errorhandler(500)
    def handle_server_error(e):
        logger.error(f"Internal Server Error: {str(e)}")
        return jsonify({
            "success": False,
            "error": "An internal server error occurred. Please try again later."
        }), 500

    @app.errorhandler(400)
    def handle_bad_request(e):
        return jsonify({
            "success": False,
            "error": "Bad request. Please verify the request payload."
        }), 400

    logger.info(f"AskSphere AI Flask Application initialized. Serving UI from {frontend_dir}")
    return app

app = create_app()

if __name__ == "__main__":
    logger.info(f"Starting AskSphere AI server on http://{Config.HOST}:{Config.PORT}")
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
