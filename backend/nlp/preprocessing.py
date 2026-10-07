import re
import string
from typing import List

# Standard English stopwords fallback
DEFAULT_STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both",
    "but", "by", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't",
    "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't",
    "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
    "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll",
    "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's",
    "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once",
    "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
    "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
    "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
    "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those",
    "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd",
    "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where",
    "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't",
    "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
    "yourself", "yourselves", "please", "want", "tell"
}

# Preserve domain-critical question tokens that differentiate intent
STOPWORDS_TO_KEEP = {"how", "why", "what", "where", "can", "cannot", "not", "who", "when"}

try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.tokenize import word_tokenize
    from nltk.stem import WordNetLemmatizer

    try:
        nltk.data.find("corpora/stopwords")
    except LookupError:
        nltk.download("stopwords", quiet=True)
    
    try:
        nltk.data.find("tokenizers/punkt")
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        nltk.download("punkt", quiet=True)
        nltk.download("punkt_tab", quiet=True)

    try:
        nltk.data.find("corpora/wordnet")
    except LookupError:
        nltk.download("wordnet", quiet=True)

    _nltk_stopwords = set(stopwords.words("english"))
    STOP_WORDS = (_nltk_stopwords | DEFAULT_STOPWORDS) - STOPWORDS_TO_KEEP
    lemmatizer = WordNetLemmatizer()
    HAS_NLTK = True
except Exception:
    STOP_WORDS = DEFAULT_STOPWORDS - STOPWORDS_TO_KEEP
    lemmatizer = None
    HAS_NLTK = False


class TextPreprocessor:
    """Production NLP Preprocessing pipeline for FAQ text."""

    @staticmethod
    def clean_text(text: str) -> str:
        """Normalize whitespace, remove special symbols, lowercase."""
        if not text:
            return ""
        # Lowercase
        text = text.lower()
        # Expand common contractions
        contractions = {
            "can't": "cannot",
            "won't": "will not",
            "n't": " not",
            "'re": " are",
            "'s": " is",
            "'d": " would",
            "'ll": " will",
            "'ve": " have",
            "'m": " am",
            "cant": "cannot",
            "dont": "do not",
            "didnt": "did not",
            "wont": "will not",
            "isnt": "is not",
            "arent": "are not"
        }
        for k, v in contractions.items():
            text = re.sub(rf"\b{k}\b", v, text)
        
        # Replace punctuation with spaces
        text = re.sub(r"[^\w\s]", " ", text)
        # Collapse multiple spaces
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @staticmethod
    def tokenize(text: str) -> List[str]:
        """Tokenize cleaned string into word tokens."""
        cleaned = TextPreprocessor.clean_text(text)
        if not cleaned:
            return []
        
        if HAS_NLTK:
            try:
                tokens = word_tokenize(cleaned)
                return tokens
            except Exception:
                pass
        return cleaned.split()

    @staticmethod
    def remove_stopwords(tokens: List[str]) -> List[str]:
        """Filter out common non-informative stopwords."""
        return [tok for tok in tokens if tok not in STOP_WORDS and len(tok) > 1]

    @staticmethod
    def lemmatize_tokens(tokens: List[str]) -> List[str]:
        """Apply lemmatization to extract base lemma."""
        if not HAS_NLTK or lemmatizer is None:
            # Fallback simple suffix trimmer
            return tokens
        lemmas = []
        for tok in tokens:
            try:
                lemma = lemmatizer.lemmatize(tok)
                # also try verb lemmatization
                lemma = lemmatizer.lemmatize(lemma, pos="v")
                lemmas.append(lemma)
            except Exception:
                lemmas.append(tok)
        return lemmas

    @classmethod
    def preprocess(cls, text: str) -> str:
        """Full pipeline: clean -> tokenize -> remove stopwords -> lemmatize -> join."""
        tokens = cls.tokenize(text)
        filtered = cls.remove_stopwords(tokens)
        lemmatized = cls.lemmatize_tokens(filtered)
        return " ".join(lemmatized)
