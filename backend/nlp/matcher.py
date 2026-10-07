import numpy as np
from typing import List, Dict, Any, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from .preprocessing import TextPreprocessor
from utils.logger import logger
from config import Config

class FAQMatcher:
    """
    Production-grade TF-IDF & Cosine Similarity Matcher for FAQ retrieval.
    Precomputes question and keyword TF-IDF matrices on startup for sub-millisecond querying.
    """

    def __init__(self, threshold: float = Config.DEFAULT_CONFIDENCE_THRESHOLD):
        self.threshold = threshold
        self.vectorizer_question: Optional[TfidfVectorizer] = None
        self.vectorizer_keywords: Optional[TfidfVectorizer] = None
        self.question_matrix = None
        self.keyword_matrix = None
        self.faqs: List[Dict[str, Any]] = []

    def fit(self, faqs: List[Dict[str, Any]]) -> None:
        """
        Fits TF-IDF vectorizers on FAQ questions and supplemental keywords/categories.
        Precomputes vectors once for ultra-fast matching.
        """
        self.faqs = faqs
        question_corpus = []
        keyword_corpus = []

        for faq in faqs:
            q_text = faq.get("question", "")
            kw_text = " ".join(faq.get("keywords", [])) + " " + faq.get("category", "")
            
            question_corpus.append(TextPreprocessor.preprocess(q_text))
            keyword_corpus.append(TextPreprocessor.preprocess(kw_text))

        # 1. Question vectorizer with unigrams & bigrams
        self.vectorizer_question = TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True,
            norm="l2",
            min_df=1
        )
        self.question_matrix = self.vectorizer_question.fit_transform(question_corpus)

        # 2. Keywords vectorizer
        self.vectorizer_keywords = TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True,
            norm="l2",
            min_df=1
        )
        self.keyword_matrix = self.vectorizer_keywords.fit_transform(keyword_corpus)

        total_features = len(self.vectorizer_question.vocabulary_) + len(self.vectorizer_keywords.vocabulary_)
        logger.info(f"FAQMatcher indexed {len(faqs)} FAQs with {total_features} total features.")

    @property
    def vectorizer(self):
        """Backwards compatibility accessor for status endpoint."""
        return self.vectorizer_question

    def match(self, user_question: str) -> Dict[str, Any]:
        """
        Preprocesses user question, computes TF-IDF representations,
        calculates dual cosine similarity, and evaluates confidence.
        """
        if not user_question or not user_question.strip():
            return {
                "success": False,
                "is_fallback": True,
                "error": "Question cannot be empty.",
                "confidence": 0.0,
                "confidence_percentage": 0,
                "confidence_level": "No confident match",
                "answer": "Please enter a question so I can help you.",
                "matched_question": None,
                "matched_faq": None,
                "suggestions": self.get_default_suggestions()
            }

        if len(user_question) > Config.MAX_QUESTION_LENGTH:
            return {
                "success": False,
                "is_fallback": True,
                "error": f"Question exceeds maximum length of {Config.MAX_QUESTION_LENGTH} characters.",
                "confidence": 0.0,
                "confidence_percentage": 0,
                "confidence_level": "No confident match",
                "answer": "Your question is too long. Please summarize your query and try again.",
                "matched_question": None,
                "matched_faq": None,
                "suggestions": self.get_default_suggestions()
            }

        if self.vectorizer_question is None or self.question_matrix is None or not self.faqs:
            return {
                "success": False,
                "is_fallback": True,
                "error": "FAQ matcher is not ready.",
                "confidence": 0.0,
                "confidence_percentage": 0,
                "confidence_level": "System Error",
                "answer": "The system is currently initializing. Please try again in a moment.",
                "matched_question": None,
                "matched_faq": None,
                "suggestions": []
            }

        # NLP Preprocessing
        clean_query = TextPreprocessor.clean_text(user_question)
        processed_query = TextPreprocessor.preprocess(user_question)
        tokens = TextPreprocessor.tokenize(clean_query)
        filtered_tokens = TextPreprocessor.remove_stopwords(tokens)

        query_str = processed_query if processed_query.strip() else clean_query

        # Transform query vector against questions and keywords
        q_vec = self.vectorizer_question.transform([query_str])
        kw_vec = self.vectorizer_keywords.transform([query_str])

        # Compute cosine similarity
        q_sim = cosine_similarity(q_vec, self.question_matrix).flatten()
        kw_sim = cosine_similarity(kw_vec, self.keyword_matrix).flatten()

        # Weighted combination: 0.70 weight to question similarity, 0.30 weight to keywords
        # Also reward maximum score when one is exceptionally high
        combined_scores = 0.70 * q_sim + 0.30 * kw_sim
        max_component = np.maximum(q_sim, kw_sim)
        final_scores = np.maximum(combined_scores, 0.90 * max_component)

        if len(final_scores) == 0:
            best_idx = -1
            best_score = 0.0
        else:
            best_idx = int(np.argmax(final_scores))
            best_score = float(final_scores[best_idx])

        # Confidence value capped at 1.0
        confidence = min(round(best_score, 2), 1.0)
        confidence_percentage = int(confidence * 100)

        # Categorize confidence level
        if confidence >= Config.CONFIDENCE_HIGH_THRESHOLD:
            confidence_level = "High confidence"
        elif confidence >= Config.CONFIDENCE_GOOD_THRESHOLD:
            confidence_level = "Good match"
        elif confidence >= Config.CONFIDENCE_POSSIBLE_THRESHOLD:
            confidence_level = "Possible match"
        else:
            confidence_level = "No confident match"

        # Alternative suggestions (rank top 3 other FAQs)
        sorted_indices = np.argsort(final_scores)[::-1]
        alternative_suggestions = []
        for idx in sorted_indices[1:4]:
            if final_scores[idx] > 0.15:
                alternative_suggestions.append({
                    "id": self.faqs[idx]["id"],
                    "question": self.faqs[idx]["question"],
                    "category": self.faqs[idx]["category"],
                    "similarity": round(float(final_scores[idx]), 2),
                    "confidence_percentage": int(round(float(final_scores[idx]), 2) * 100)
                })

        # Confident match
        if confidence >= self.threshold and best_idx >= 0:
            matched_faq = self.faqs[best_idx]
            logger.info(f"Match: '{user_question}' -> '{matched_faq['question']}' ({confidence_percentage}%)")
            return {
                "success": True,
                "is_fallback": False,
                "answer": matched_faq["answer"],
                "matched_question": matched_faq["question"],
                "matched_faq": {
                    "id": matched_faq["id"],
                    "category": matched_faq["category"],
                    "question": matched_faq["question"],
                    "keywords": matched_faq.get("keywords", [])
                },
                "confidence": confidence,
                "confidence_percentage": confidence_percentage,
                "confidence_level": confidence_level,
                "tokens": filtered_tokens,
                "alternative_suggestions": alternative_suggestions
            }
        else:
            # Fallback for low confidence or unrelated question
            logger.info(f"Fallback triggered for '{user_question}' (confidence: {confidence_percentage}%)")
            return {
                "success": True,
                "is_fallback": True,
                "answer": (
                    "I'm not completely sure about that question. "
                    "Please try rephrasing your inquiry or choose from the suggested FAQs below."
                ),
                "matched_question": self.faqs[best_idx]["question"] if best_idx >= 0 and confidence > 0 else None,
                "matched_faq": {
                    "id": self.faqs[best_idx]["id"],
                    "category": self.faqs[best_idx]["category"],
                    "question": self.faqs[best_idx]["question"],
                    "keywords": self.faqs[best_idx].get("keywords", [])
                } if best_idx >= 0 and confidence > 0 else None,
                "confidence": confidence,
                "confidence_percentage": confidence_percentage,
                "confidence_level": confidence_level,
                "tokens": filtered_tokens,
                "fallback_options": [
                    {"label": "Browse Knowledge Base", "action": "browse_faqs"},
                    {"label": "Contact Support Team", "action": "contact_support"},
                    {"label": "Try Another Question", "action": "rephrase"}
                ],
                "alternative_suggestions": alternative_suggestions if alternative_suggestions else self.get_default_suggestions()
            }

    def get_default_suggestions(self) -> List[Dict[str, Any]]:
        """Return popular default FAQs for recommendations."""
        defaults = [
            "How do I reset my password?",
            "What payment methods are supported?",
            "How can I track my order or service request?",
            "How can I contact customer support?"
        ]
        results = []
        for faq in self.faqs:
            if faq["question"] in defaults:
                results.append({
                    "id": faq["id"],
                    "question": faq["question"],
                    "category": faq["category"],
                    "similarity": 1.0,
                    "confidence_percentage": 100
                })
        return results[:4]
