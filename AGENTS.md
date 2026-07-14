# MTG Opening Hand Analyzer

This project is a local Streamlit application for Magic: The Gathering opening-hand analysis. It must remain useful even when screenshot recognition is imperfect.

## Architecture

- `desktop_app.py`: Windows desktop GUI workflow.
- `app.py`: Streamlit workflow retained as a browser fallback.
- `src/mtg_hand_analyzer/deck_parser.py`: Arena decklist parsing and hand-copy validation.
- `card_data.py` and `card_cache.py`: card-data providers and local SQLite cache.
- `probability.py`: exact hypergeometric calculations.
- `mana.py`: mana-cost parsing and seeded Monte Carlo castability estimates.
- `screenshot_detection.py` and `card_recognition.py`: local crop detection and deck-restricted image matching.
- `analysis.py`: shared analysis pipeline used by manual and screenshot workflows.

## Commands

- Setup on Windows: double-click `setup.bat`.
- Run desktop app: double-click `run_desktop.bat`.
- Run browser fallback: double-click `run.bat`.
- Build executable: double-click `build_exe.bat`.
- Tests: `.venv\Scripts\python -m pytest`.
- Lint: `.venv\Scripts\python -m ruff check .`.
- Generate synthetic screenshot: `.venv\Scripts\python scripts\generate_test_screenshot.py`.

## Requirements

- Never fabricate probabilities. Use exact formulas or clearly labeled seeded simulations.
- Recognition must always allow manual correction before analysis.
- Tests must not use live network services.
- Do not upload screenshots or decklists to external services.
- Keep user data local under `data/`.
