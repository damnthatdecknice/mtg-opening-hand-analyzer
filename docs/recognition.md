# Recognition

Screenshot recognition is local. The app first looks in the lower portion of a likely MTG Arena screenshot, searches for repeated card-shaped regions, and falls back to normalized seven-card crop boxes when contour detection is not strong enough.

Each crop is compared only against cards in the submitted main deck. Matching combines perceptual hash distance, color histogram similarity, and edge similarity. The resulting value is a match score, not a calibrated probability.

The app shows the crop, the top candidates, and confidence labels. Medium and low confidence results require user review, and every result can be corrected manually before analysis.

OCR is not the primary method because reliable OCR on Windows often requires additional system installation and card art/name treatment varies by screenshot state. Real Arena screenshots are still needed to evaluate practical recognition accuracy; synthetic tests only prove the local pipeline works.
