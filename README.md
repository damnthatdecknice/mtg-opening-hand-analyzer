# MTG Opening Hand Analyzer

MTG Opening Hand Analyzer is a local Windows-friendly Streamlit app for analyzing a Magic: The Gathering seven-card opening hand. You can paste a decklist, manually select or screenshot-detect a hand, confirm/correct the seven cards, and review draw, land, category, and basic castability statistics.

## Free Web App Deployment

This project is ready for Streamlit Community Cloud.

1. Create a public GitHub repository.
2. Push this project to that repo.
3. Go to https://share.streamlit.io/.
4. Choose the repo.
5. Set the main file path to `app.py`.
6. Deploy.

The hosted web app uses `requirements.txt` and does not need the Windows desktop packaging files. The app refreshes card data from Scryfall when analyzing new decks.

Important privacy note: the local desktop app keeps screenshots and decklists on your computer. The hosted Streamlit version processes uploaded screenshots and pasted decklists on the Streamlit app server.

## Windows Setup

1. Install Python 3.12 from https://www.python.org/downloads/windows/.
2. Download or clone this project.
3. Double-click `setup.bat`.
4. Double-click `run_desktop.bat` for the normal desktop app, or `run.bat` for the browser interface.
5. Paste a decklist.
6. Upload a screenshot if desired.
7. Confirm recognized cards.
8. Review the statistics.

Normal use does not require typing terminal commands. To build a standalone Windows program, double-click `build_exe.bat`; the executable will be created at `dist\MTG Opening Hand Analyzer\MTG Opening Hand Analyzer.exe`.

## What Works

- MTG Arena-style decklist parsing with main deck and sideboard separation.
- Manual seven-card hand selection from the submitted main deck.
- Local screenshot upload for PNG, JPG, JPEG, and WEBP.
- Local seven-crop detection with fallback crop boxes.
- Deck-restricted image matching using perceptual hash, color histograms, and edges.
- Manual correction before any calculation.
- Exact hypergeometric draw probabilities from the remaining library.
- Play-versus-draw turn handling.
- Land, category, and basic seeded castability estimates.
- Overview, Deep Data, Mulligan, and OTHER analysis tabs.
- Local SQLite saved decks and card cache in the desktop app.

## Privacy

Decklists, settings, cached card data, and optional crop/debug files stay under `data/` on your computer. Screenshots are processed locally and are not uploaded to an AI service. Raw uploaded screenshots are not saved permanently by default.

## Recognition

Recognition compares detected screenshot crops only against the submitted main deck. Scores are match scores, not calibrated probabilities. Always confirm the hand before trusting analysis. Place real test screenshots in `data/samples/user_arena_screenshots/`; the folder can be empty.

## Probabilities

The app removes the confirmed seven cards from the main deck, then uses exact hypergeometric math for draw probabilities. Castability uses a seeded Monte Carlo estimate and displays the seed and trial count.

## Troubleshooting

- If `run.bat` says setup is missing, run `setup.bat`.
- If setup cannot find Python, install Python 3.12 and enable the Python launcher.
- If card data cannot be fetched later, cached and fixture data still allow offline sample use.
- If screenshot recognition is wrong, use the confirmation screen to correct each card.

## Current Limitations

Real Arena recognition accuracy has not been proven without real screenshots. Complex mana mechanics, alternate costs, treasures, mana creatures, detailed modal behavior, and professional mulligan strategy are not modeled.
