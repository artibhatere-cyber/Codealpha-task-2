from flask import Blueprint, request, jsonify
from services.faq_service import faq_service
from utils.logger import logger

faq_bp = Blueprint("faq_bp", __name__)

@faq_bp.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint providing system status and NLP index statistics."""
    matcher = faq_service.matcher
    vocab_size = len(matcher.vectorizer.vocabulary_) if matcher.vectorizer else 0
    return jsonify({
        "status": "healthy",
        "service": "AskSphere AI",
        "total_faqs": len(faq_service.faqs),
        "indexed_features": vocab_size,
        "default_threshold": matcher.threshold
    }), 200


@faq_bp.route("/api/faqs", methods=["GET"])
def get_faqs():
    """Get list of FAQs with optional category and search filters."""
    category = request.args.get("category", None)
    search = request.args.get("search", None)
    results = faq_service.get_all(category=category, search=search)
    return jsonify({
        "success": True,
        "count": len(results),
        "faqs": results
    }), 200


@faq_bp.route("/api/faqs/categories", methods=["GET"])
def get_categories():
    """Get all unique FAQ categories with item counts."""
    categories = faq_service.get_categories()
    category_counts = []
    
    # Calculate counts per category
    all_faqs = faq_service.faqs
    category_counts.append({
        "name": "All",
        "count": len(all_faqs)
    })
    for cat in categories:
        count = sum(1 for f in all_faqs if f.get("category") == cat)
        category_counts.append({
            "name": cat,
            "count": count
        })

    return jsonify({
        "success": True,
        "categories": category_counts
    }), 200


@faq_bp.route("/api/faqs/<int:faq_id>", methods=["GET"])
def get_faq_by_id(faq_id: int):
    """Retrieve an FAQ by ID."""
    faq = faq_service.get_by_id(faq_id)
    if not faq:
        return jsonify({"success": False, "error": "FAQ not found."}), 404
    return jsonify({"success": True, "faq": faq}), 200


@faq_bp.route("/api/faqs", methods=["POST"])
def add_faq():
    """Add a new FAQ entry to knowledge base and update vectorizer."""
    data = request.get_json(silent=True)
    if not data or not data.get("question") or not data.get("answer"):
        return jsonify({
            "success": False,
            "error": "Both 'question' and 'answer' fields are required."
        }), 400

    new_faq = faq_service.add_faq(data)
    return jsonify({
        "success": True,
        "message": "FAQ added successfully.",
        "faq": new_faq
    }), 201


@faq_bp.route("/api/faqs/<int:faq_id>", methods=["PUT"])
def update_faq(faq_id: int):
    """Update an existing FAQ and reindex."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"success": False, "error": "No update data provided."}), 400

    updated = faq_service.update_faq(faq_id, data)
    if not updated:
        return jsonify({"success": False, "error": "FAQ not found."}), 404

    return jsonify({
        "success": True,
        "message": "FAQ updated successfully.",
        "faq": updated
    }), 200


@faq_bp.route("/api/faqs/<int:faq_id>", methods=["DELETE"])
def delete_faq(faq_id: int):
    """Delete an FAQ and reindex."""
    success = faq_service.delete_faq(faq_id)
    if not success:
        return jsonify({"success": False, "error": "FAQ not found."}), 404

    return jsonify({
        "success": True,
        "message": "FAQ deleted successfully."
    }), 200
