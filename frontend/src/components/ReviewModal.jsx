import { useState } from "react";
import { api } from "@/lib/api";
import "./components.css";

export default function ReviewModal({ contractId, revieweeName, onClose, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (rating === 0) { setError("Please select a rating"); return; }
    setError("");
    setLoading(true);
    try {
      await api.post("/reviews", { contract_id: contractId, rating, comment });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit review");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rvm-overlay" onClick={onClose}>
      <div className="rvm-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="rvm-title">Rate Your Experience</h2>
        <p className="rvm-subtitle">How was your transaction with {revieweeName}?</p>

        {error && (
          <div className="rvm-error">{error}</div>
        )}

        <div className="rvm-stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="rvm-star"
            >
              {(hoverRating || rating) >= star ? "⭐" : "☆"}
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience (optional)..."
          rows={3}
          className="rvm-textarea"
        />

        <div className="rvm-actions">
          <button onClick={onClose} className="rvm-cancel">
            Cancel
          </button>
          <button onClick={submit} disabled={loading} className="rvm-submit">
            {loading ? "Submitting..." : "Submit Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
