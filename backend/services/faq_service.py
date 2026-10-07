import json
import os
from typing import List, Dict, Any, Optional
from nlp.matcher import FAQMatcher
from utils.logger import logger
from config import Config

class FAQService:
    """Service layer managing the FAQ knowledge base and NLP matcher."""

    def __init__(self, data_path: str = Config.FAQ_DATA_PATH):
        self.data_path = data_path
        self.faqs: List[Dict[str, Any]] = []
        self.matcher = FAQMatcher()
        self.load_faqs()

    def load_faqs(self) -> None:
        """Load FAQ entries from JSON and reindex the TF-IDF matcher."""
        try:
            if os.path.exists(self.data_path):
                with open(self.data_path, "r", encoding="utf-8") as f:
                    self.faqs = json.load(f)
                logger.info(f"Loaded {len(self.faqs)} FAQs from {self.data_path}")
            else:
                logger.warning(f"FAQ data file not found at {self.data_path}. Creating empty list.")
                self.faqs = []
            
            # Train / fit matcher
            self.matcher.fit(self.faqs)
        except Exception as e:
            logger.error(f"Error loading FAQs: {str(e)}")
            self.faqs = []

    def save_faqs(self) -> bool:
        """Save current FAQs to JSON file."""
        try:
            os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
            with open(self.data_path, "w", encoding="utf-8") as f:
                json.dump(self.faqs, f, indent=2, ensure_ascii=False)
            # Reindex matcher after saving
            self.matcher.fit(self.faqs)
            return True
        except Exception as e:
            logger.error(f"Error saving FAQs: {str(e)}")
            return False

    def get_all(self, category: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all FAQs with optional category filter and text search."""
        results = self.faqs
        if category and category.lower() != "all":
            results = [f for f in results if f.get("category", "").lower() == category.lower()]
        if search and search.strip():
            query = search.strip().lower()
            results = [
                f for f in results
                if query in f.get("question", "").lower()
                or query in f.get("answer", "").lower()
                or any(query in kw.lower() for kw in f.get("keywords", []))
            ]
        return results

    def get_by_id(self, faq_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve single FAQ by its ID."""
        for faq in self.faqs:
            if faq.get("id") == faq_id:
                return faq
        return None

    def get_categories(self) -> List[str]:
        """Get distinct list of FAQ categories."""
        categories = sorted(list({f.get("category", "General") for f in self.faqs}))
        return categories

    def match_question(self, question: str) -> Dict[str, Any]:
        """Perform NLP matching against FAQ knowledge base."""
        return self.matcher.match(question)

    def add_faq(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Add a new FAQ entry and update the vector index."""
        next_id = max([f.get("id", 0) for f in self.faqs], default=0) + 1
        new_faq = {
            "id": next_id,
            "category": data.get("category", "General").strip(),
            "question": data.get("question", "").strip(),
            "answer": data.get("answer", "").strip(),
            "keywords": [kw.strip() for kw in data.get("keywords", []) if kw.strip()]
        }
        self.faqs.append(new_faq)
        self.save_faqs()
        logger.info(f"Added new FAQ #{next_id}: '{new_faq['question']}'")
        return new_faq

    def update_faq(self, faq_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing FAQ entry and reindex."""
        for i, faq in enumerate(self.faqs):
            if faq.get("id") == faq_id:
                if "category" in data:
                    faq["category"] = data["category"].strip()
                if "question" in data:
                    faq["question"] = data["question"].strip()
                if "answer" in data:
                    faq["answer"] = data["answer"].strip()
                if "keywords" in data:
                    faq["keywords"] = [kw.strip() for kw in data["keywords"] if kw.strip()]
                self.faqs[i] = faq
                self.save_faqs()
                logger.info(f"Updated FAQ #{faq_id}")
                return faq
        return None

    def delete_faq(self, faq_id: int) -> bool:
        """Delete an FAQ by ID and reindex."""
        initial_count = len(self.faqs)
        self.faqs = [f for f in self.faqs if f.get("id") != faq_id]
        if len(self.faqs) < initial_count:
            self.save_faqs()
            logger.info(f"Deleted FAQ #{faq_id}")
            return True
        return False

# Global service instance
faq_service = FAQService()
