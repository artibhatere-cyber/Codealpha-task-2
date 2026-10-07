import os

class Config:
    """Application configuration."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "asksphere-ai-secret-key-2025")
    DEBUG = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1")
    PORT = int(os.environ.get("PORT", 5000))
    HOST = os.environ.get("HOST", "127.0.0.1")
    
    # Path to FAQ dataset
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    FAQ_DATA_PATH = os.path.join(BASE_DIR, "data", "faqs.json")
    
    # NLP / Matching Settings
    # Thresholds:
    # >= 0.70: High confidence
    # 0.50 - 0.69: Good match
    # 0.35 - 0.49: Possible match
    # < 0.35: Fallback / Low confidence
    CONFIDENCE_HIGH_THRESHOLD = 0.70
    CONFIDENCE_GOOD_THRESHOLD = 0.50
    CONFIDENCE_POSSIBLE_THRESHOLD = 0.35
    DEFAULT_CONFIDENCE_THRESHOLD = 0.35
    
    # Maximum allowed question length in characters
    MAX_QUESTION_LENGTH = 500
