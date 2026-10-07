from flask import Blueprint, request, jsonify
from services.faq_service import faq_service
from nlp.preprocessing import TextPreprocessor
from utils.logger import logger
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

chat_bp = Blueprint("chat_bp", __name__)

@chat_bp.route("/api/chat", methods=["POST"])
def chat():
    """
    Main chat endpoint for natural-language question matching.
    Expects JSON: { "question": str }
    """
    data = request.get_json(silent=True)
    if not data or "question" not in data:
        return jsonify({
            "success": False,
            "error": "Missing 'question' in request body."
        }), 400

    question = data.get("question", "").strip()
    if not question:
        return jsonify({
            "success": False,
            "error": "Question cannot be empty.",
            "is_fallback": True,
            "answer": "Please enter a valid question so I can assist you."
        }), 400

    logger.info(f"Received user query: '{question}'")
    match_result = faq_service.match_question(question)
    return jsonify(match_result), 200


@chat_bp.route("/api/chat/analyze", methods=["POST"])
def analyze_query():
    """
    NLP Inspection endpoint for evaluation & demonstration.
    Returns step-by-step preprocessing and similarity matrix across top FAQs.
    """
    data = request.get_json(silent=True)
    if not data or "question" not in data:
        return jsonify({"success": False, "error": "Missing 'question'"}), 400

    question = data.get("question", "").strip()
    cleaned = TextPreprocessor.clean_text(question)
    raw_tokens = TextPreprocessor.tokenize(cleaned)
    filtered_tokens = TextPreprocessor.remove_stopwords(raw_tokens)
    lemmas = TextPreprocessor.lemmatize_tokens(filtered_tokens)
    processed_str = " ".join(lemmas)

    matcher = faq_service.matcher
    all_scores = []
    
    if matcher.vectorizer_question and matcher.question_matrix is not None:
        query_str = processed_str if processed_str else cleaned
        q_vec = matcher.vectorizer_question.transform([query_str])
        kw_vec = matcher.vectorizer_keywords.transform([query_str])
        
        q_sim = cosine_similarity(q_vec, matcher.question_matrix).flatten()
        kw_sim = cosine_similarity(kw_vec, matcher.keyword_matrix).flatten()
        
        combined_scores = 0.70 * q_sim + 0.30 * kw_sim
        max_component = np.maximum(q_sim, kw_sim)
        final_scores = np.maximum(combined_scores, 0.90 * max_component)

        sorted_indices = np.argsort(final_scores)[::-1]
        for idx in sorted_indices[:8]:
            faq = matcher.faqs[idx]
            all_scores.append({
                "id": faq["id"],
                "question": faq["question"],
                "category": faq["category"],
                "question_sim": round(float(q_sim[idx]), 3),
                "keyword_sim": round(float(kw_sim[idx]), 3),
                "final_similarity": round(float(final_scores[idx]), 3),
                "confidence_percentage": int(round(float(final_scores[idx]), 2) * 100)
            })

    return jsonify({
        "success": True,
        "original_question": question,
        "cleaned_text": cleaned,
        "tokens": raw_tokens,
        "stopwords_removed": [t for t in raw_tokens if t not in filtered_tokens],
        "lemmas": lemmas,
        "processed_pipeline_output": processed_str,
        "similarity_breakdown": all_scores
    }), 200
