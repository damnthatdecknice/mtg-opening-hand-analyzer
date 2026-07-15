from __future__ import annotations

import sys
import random
import tempfile
import time
from collections import Counter
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QFileDialog,
    QFrame,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QRadioButton,
    QScrollArea,
    QSplitter,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mtg_hand_analyzer.analysis import analyze_hand
from mtg_hand_analyzer.card_draw import draw_look_depth
from mtg_hand_analyzer.card_cache import CardCache
from mtg_hand_analyzer.card_data import FixtureCardDataProvider, ScryfallProvider
from mtg_hand_analyzer.card_recognition import recognize_crops
from mtg_hand_analyzer.database import AppDatabase
from mtg_hand_analyzer.deck_parser import (
    analysis_counts_for_hand,
    parse_decklist,
    recognition_counts,
    validate_hand_counts,
)
from mtg_hand_analyzer.land_inference import enrich_card_data
from mtg_hand_analyzer.mana import parse_mana_cost
from mtg_hand_analyzer.models import CardData, PlayDraw
from mtg_hand_analyzer.screenshot_detection import detect_hand_region_boxes, load_image, save_crops
from mtg_hand_analyzer.settings import (
    APP_DB_PATH,
    CARD_DB_PATH,
    CARD_FIXTURE_PATH,
    SAMPLE_DECK_PATH,
    ensure_data_dirs,
)
from mtg_hand_analyzer.window_capture import capture_window_to_file, find_mtgo_window, is_supported_platform


def bundled_path(*parts: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", ROOT))
    return base.joinpath(*parts)


class DesktopAnalyzer(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("MTG Opening Hand Analyzer")
        self.resize(1480, 900)
        self.setMinimumSize(1180, 760)

        ensure_data_dirs()
        self.db = AppDatabase(APP_DB_PATH)
        self.card_cache = CardCache(CARD_DB_PATH)
        self.fixture_provider = FixtureCardDataProvider(CARD_FIXTURE_PATH)
        self.deck = parse_decklist("")
        self.cards: dict[str, CardData] = {}
        self.hand_selectors: list[QComboBox] = []
        self.crop_labels: list[QLabel] = []

        self._build_layout()
        self.apply_theme()
        self.load_sample_deck()

    def _build_layout(self) -> None:
        root = QWidget()
        root.setObjectName("appRoot")
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(18, 16, 18, 18)
        layout.setSpacing(12)

        header_panel = QFrame()
        header_panel.setObjectName("headerPanel")
        header = QHBoxLayout(header_panel)
        header.setContentsMargins(22, 14, 22, 16)
        title_stack = QVBoxLayout()
        title = QLabel("MTG Opening Hand Analyzer")
        title.setObjectName("appTitle")
        subtitle = QLabel("Opening-hand math for Magic")
        subtitle.setObjectName("appSubtitle")
        title_stack.addWidget(QLabel("COMPETITIVE OPENER LAB"))
        title_stack.itemAt(0).widget().setObjectName("appKicker")
        title_stack.addWidget(title)
        title_stack.addWidget(subtitle)
        header.addLayout(title_stack, stretch=1)
        header.addStretch()
        parse_button = QPushButton("Parse Deck")
        parse_button.clicked.connect(lambda: self.parse_deck())
        image_button = QPushButton("Load Image")
        image_button.clicked.connect(self.load_image_file)
        paste_image_button = QPushButton("Paste Screenshot")
        paste_image_button.clicked.connect(self.paste_image)
        capture_mtgo_button = QPushButton("Capture MTGO Window")
        capture_mtgo_button.clicked.connect(self.capture_mtgo_window)
        analyze_button = QPushButton("Analyze")
        analyze_button.clicked.connect(self.analyze)
        header.addWidget(parse_button)
        header.addWidget(image_button)
        header.addWidget(paste_image_button)
        header.addWidget(capture_mtgo_button)
        header.addWidget(analyze_button)
        layout.addWidget(header_panel)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        layout.addWidget(splitter, stretch=1)

        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(12)
        splitter.addWidget(left)

        deck_buttons = QHBoxLayout()
        deck_buttons.addWidget(QLabel("Decklist"))
        deck_buttons.addStretch()
        sample_button = QPushButton("Sample Deck")
        sample_button.clicked.connect(self.load_sample_deck)
        paste_button = QPushButton("Paste Clipboard")
        paste_button.clicked.connect(self.paste_deck)
        deck_buttons.addWidget(sample_button)
        deck_buttons.addWidget(paste_button)
        left_layout.addLayout(deck_buttons)

        self.deck_text = QTextEdit()
        self.deck_text.setObjectName("deckInput")
        self.deck_text.setAcceptRichText(False)
        self.deck_text.setPlaceholderText("Paste an MTG Arena decklist here.")
        left_layout.addWidget(self.deck_text, stretch=3)

        options = QHBoxLayout()
        self.on_play = QRadioButton("On the play")
        self.on_draw = QRadioButton("On the draw")
        self.on_play.setChecked(True)
        refresh_label = QLabel("Card data refreshes from Scryfall when parsing.")
        refresh_label.setStyleSheet("color: #6da9df;")
        options.addWidget(refresh_label)
        options.addStretch()
        options.addWidget(self.on_play)
        options.addWidget(self.on_draw)
        left_layout.addLayout(options)

        self.status = QLabel("Ready.")
        self.status.setObjectName("statusText")
        left_layout.addWidget(self.status)

        hand_group = QGroupBox("Confirmed Opening Hand")
        hand_group.setObjectName("glassPanel")
        self.hand_layout = QGridLayout(hand_group)
        self.hand_layout.setHorizontalSpacing(8)
        self.hand_layout.setVerticalSpacing(8)
        left_layout.addWidget(hand_group, stretch=2)

        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(12)
        splitter.addWidget(right)
        splitter.setSizes([690, 790])

        image_group = QGroupBox("Screenshot and Detected Crops")
        image_group.setObjectName("glassPanel")
        image_layout = QVBoxLayout(image_group)
        self.image_label = QLabel("Load a PNG/JPG/JPEG/WEBP screenshot to attempt recognition.")
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setMinimumHeight(250)
        self.image_label.setFrameShape(QFrame.Shape.StyledPanel)
        image_layout.addWidget(self.image_label, stretch=1)
        self.crop_scroll = QScrollArea()
        self.crop_scroll.setWidgetResizable(True)
        self.crop_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.crop_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.crop_scroll.setMinimumHeight(270)
        self.crop_strip = QWidget()
        self.crop_row = QHBoxLayout(self.crop_strip)
        self.crop_row.setContentsMargins(8, 8, 8, 8)
        self.crop_row.setSpacing(16)
        self.crop_row.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.crop_scroll.setWidget(self.crop_strip)
        image_layout.addWidget(self.crop_scroll)
        right_layout.addWidget(image_group, stretch=1)

        analysis_group = QGroupBox("Analysis")
        analysis_group.setObjectName("glassPanel")
        analysis_layout = QVBoxLayout(analysis_group)
        self.result_tabs = QTabWidget()
        self.output = QTextEdit()
        self.output.setReadOnly(True)
        self.output.setPlainText("Paste a decklist, confirm seven cards, then analyze.")
        self.deep_output = QTextEdit()
        self.deep_output.setReadOnly(True)
        self.deep_output.setPlainText("Detailed data will appear after analysis.")
        self.mulligan_output = QTextEdit()
        self.mulligan_output.setReadOnly(True)
        self.mulligan_output.setPlainText("Mulligan comparison will appear after analysis.")
        self.other_output = QTextEdit()
        self.other_output.setReadOnly(True)
        self.other_output.setPlainText("Competitive notes will appear after analysis.")
        self.result_tabs.addTab(self.output, "Overview")
        self.result_tabs.addTab(self.deep_output, "Deep Data")
        self.result_tabs.addTab(self.mulligan_output, "Mulligan")
        self.result_tabs.addTab(self.other_output, "OTHER")
        analysis_layout.addWidget(self.result_tabs)
        right_layout.addWidget(analysis_group, stretch=1)

    def apply_theme(self) -> None:
        background = bundled_path("assets", "jace_user_background.png").as_posix()
        self.setStyleSheet(
            f"""
            QWidget#appRoot {{
                background-image: url("{background}");
                background-position: center right;
                background-repeat: no-repeat;
                background-color: #030711;
                color: #f4f9ff;
                font-family: "Segoe UI";
                font-size: 13px;
            }}
            QFrame#headerPanel, QGroupBox#glassPanel {{
                background: rgba(7, 15, 29, 218);
                border: 1px solid rgba(128, 205, 255, 86);
                border-radius: 10px;
            }}
            QFrame#headerPanel {{
                border-bottom: 2px solid #65d8ff;
            }}
            QLabel#appKicker {{
                color: #e2c174;
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 2px;
            }}
            QLabel#appTitle {{
                color: #f4f9ff;
                font-size: 34px;
                font-weight: 900;
            }}
            QLabel#appSubtitle, QLabel#statusText {{
                color: #adc3dd;
                font-size: 14px;
            }}
            QGroupBox {{
                color: #f4f9ff;
                font-weight: 800;
                margin-top: 12px;
                padding-top: 18px;
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                left: 14px;
                color: #e2c174;
                letter-spacing: 1px;
            }}
            QTextEdit, QComboBox, QScrollArea {{
                background: rgba(3, 8, 17, 238);
                color: #f4f9ff;
                border: 1px solid rgba(130, 157, 198, 70);
                border-radius: 7px;
                selection-background-color: #2073b2;
            }}
            QComboBox {{
                min-height: 44px;
                font-size: 15px;
                padding: 4px 8px;
            }}
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #2073b2, stop:1 #17224a);
                color: #f4f9ff;
                border: 1px solid rgba(101, 216, 255, 150);
                border-radius: 7px;
                padding: 9px 13px;
                font-weight: 800;
            }}
            QPushButton:hover {{
                border-color: #e2c174;
                background: #2b8dd1;
            }}
            QTabWidget::pane {{
                border: 1px solid rgba(128, 205, 255, 48);
                border-radius: 8px;
                background: rgba(5, 10, 19, 220);
            }}
            QTabBar::tab {{
                color: #adc3dd;
                background: transparent;
                padding: 9px 14px;
                font-weight: 800;
            }}
            QTabBar::tab:selected {{
                color: #f4f9ff;
                border-bottom: 2px solid #65d8ff;
            }}
            QRadioButton {{
                color: #f4f9ff;
                font-weight: 700;
            }}
            QScrollBar:horizontal {{
                background: rgba(3, 8, 17, 190);
                height: 10px;
                border-radius: 5px;
            }}
            QScrollBar::handle:horizontal {{
                background: #2073b2;
                border-radius: 5px;
            }}
            """
        )

    def load_sample_deck(self) -> None:
        try:
            text = SAMPLE_DECK_PATH.read_text(encoding="utf-8")
        except OSError:
            text = "Deck\n"
        self.deck_text.setPlainText(text)
        self.parse_deck()

    def paste_deck(self) -> None:
        text = QApplication.clipboard().text()
        if not text.strip():
            QMessageBox.information(self, "Clipboard", "The clipboard does not contain decklist text.")
            return
        self.deck_text.setPlainText(text)
        self.parse_deck()

    def parse_deck(self, rebuild_hand: bool = True, force_refresh: bool = True) -> None:
        self.deck = parse_decklist(self.deck_text.toPlainText())
        self.cards = self.resolve_cards(list(self.selectable_counts()), force_refresh=force_refresh)
        if rebuild_hand:
            self.build_hand_selectors()
        message = f"Parsed {self.deck.main_total} main-deck cards and {self.deck.sideboard_total} sideboard cards."
        if self.deck.issues:
            message += f" {len(self.deck.issues)} line(s) need attention."
            QMessageBox.warning(
                self,
                "Decklist issues",
                "\n".join(f"Line {issue.line_number}: {issue.message}" for issue in self.deck.issues[:8]),
            )
        self.status.setText(message)

    def resolve_cards(self, names: list[str], force_refresh: bool = True) -> dict[str, CardData]:
        provider = ScryfallProvider(retries=3)
        cards: dict[str, CardData] = {}
        for name in names:
            card = self.card_cache.resolve(
                name,
                provider,
                force_refresh=force_refresh,
            )
            if not card:
                time.sleep(0.75)
                card = self.card_cache.resolve(
                    name,
                    provider,
                    force_refresh=True,
                )
            if not card:
                card = self.fixture_provider.get_card(name)
            cards[name] = enrich_card_data(name, card)
        return cards

    def build_hand_selectors(self, defaults: list[str] | None = None) -> None:
        while self.hand_layout.count():
            item = self.hand_layout.takeAt(0)
            if widget := item.widget():
                widget.deleteLater()
        self.hand_selectors = []
        names = sorted(self.selectable_counts())
        if not names:
            self.hand_layout.addWidget(QLabel("Paste and parse a deck first."))
            return
        defaults = list(defaults or names[:7])
        while len(defaults) < 7:
            defaults.append(names[0])
        for index in range(7):
            slot = QWidget()
            slot_layout = QVBoxLayout(slot)
            slot_layout.setContentsMargins(0, 0, 0, 0)
            slot_layout.setSpacing(4)
            slot_layout.addWidget(QLabel(f"Card {index + 1}"))
            combo = QComboBox()
            combo.setEditable(True)
            combo.addItems(names)
            combo.setCurrentText(defaults[index] if defaults[index] in names else names[0])
            slot_layout.addWidget(combo)
            self.hand_selectors.append(combo)
            self.hand_layout.addWidget(slot, index // 4, index % 4)

    def load_image_file(self) -> None:
        filename, _ = QFileDialog.getOpenFileName(
            self,
            "Choose MTG Arena opening hand screenshot",
            "",
            "Images (*.png *.jpg *.jpeg *.webp);;All Files (*.*)",
        )
        if not filename:
            return
        self.process_image_path(Path(filename))

    def paste_image(self) -> None:
        image = QApplication.clipboard().image()
        if image.isNull():
            QMessageBox.information(self, "Clipboard", "The clipboard does not contain a screenshot image.")
            return
        path = Path(tempfile.gettempdir()) / "mtg_hand_analyzer_pasted_screenshot.png"
        if not image.save(str(path), "PNG"):
            QMessageBox.critical(self, "Clipboard", "The pasted screenshot could not be saved for analysis.")
            return
        self.process_image_path(path)

    def capture_mtgo_window(self) -> None:
        if not is_supported_platform():
            QMessageBox.information(self, "MTGO Capture", "MTGO window capture is only available on Windows.")
            return
        window = find_mtgo_window()
        if window is None:
            QMessageBox.information(
                self,
                "MTGO Capture",
                "Bring the Magic: The Gathering Online match window with your hand visible to the foreground, then try again. As a fallback, I look for an MTGO window title containing 1-on-1 or 3-4.",
            )
            return
        path = Path(tempfile.gettempdir()) / "mtg_hand_analyzer_mtgo_window.png"
        try:
            capture_window_to_file(window, path)
        except Exception as exc:
            QMessageBox.critical(self, "MTGO Capture", f"The MTGO window could not be captured:\n{exc}")
            return
        self.process_image_path(path)

    def process_image_path(self, image_path: Path) -> None:
        self.parse_deck(force_refresh=False)
        self.status.setText("Detecting seven crops and matching them against the deck...")
        QApplication.processEvents()
        try:
            image = load_image(image_path)
            boxes = detect_hand_region_boxes(image)
            crop_paths = save_crops(image, boxes, prefix="desktop")
            results = recognize_crops(crop_paths, boxes, self.cards)
        except Exception as exc:
            QMessageBox.critical(self, "Recognition failed", str(exc))
            self.status.setText("Recognition failed. You can still select the hand manually.")
            return

        defaults = [
            result.candidates[0].card_name if result.candidates else sorted(self.selectable_counts())[0]
            for result in results
        ]
        self.show_recognition(image_path, crop_paths, results, defaults)

    def show_recognition(self, screenshot: Path, crop_paths: list[Path], results, defaults: list[str]) -> None:
        pixmap = QPixmap(str(screenshot))
        self.image_label.setPixmap(
            pixmap.scaled(560, 300, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
        )
        self.image_label.setText("")

        while self.crop_row.count():
            item = self.crop_row.takeAt(0)
            if widget := item.widget():
                widget.deleteLater()
        self.crop_labels = []
        for index, crop_path in enumerate(crop_paths):
            crop_card = QWidget()
            crop_layout = QVBoxLayout(crop_card)
            crop_layout.setContentsMargins(0, 0, 0, 0)
            crop_layout.setSpacing(8)
            label = QLabel()
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            crop_pixmap = QPixmap(str(crop_path))
            label.setPixmap(
                crop_pixmap.scaled(170, 238, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            )
            caption = QLabel(f"Crop {index + 1}")
            caption.setAlignment(Qt.AlignmentFlag.AlignCenter)
            caption.setStyleSheet("color: #adc3dd; font-weight: 800;")
            crop_layout.addWidget(label)
            crop_layout.addWidget(caption)
            self.crop_row.addWidget(crop_card)
            self.crop_labels.append(label)

        self.build_hand_selectors(defaults)
        lines = ["Recognition candidates. Please confirm or correct all seven cards:"]
        for index, result in enumerate(results, start=1):
            candidates = [
                f"{candidate.card_name} ({candidate.confidence_label}, {candidate.score:.3f})"
                for candidate in result.candidates
            ]
            notes = " ".join(result.verification_notes[:2])
            lines.append(f"{index}. {result.verification_label}: " + "; ".join(candidates))
            if notes:
                lines.append(f"   Check: {notes}")
        self.output.setPlainText("\n".join(lines))
        self.deep_output.setPlainText("Detailed data will appear after analysis.")
        self.mulligan_output.setPlainText("Mulligan comparison will appear after analysis.")
        self.other_output.setPlainText("Competitive notes will appear after analysis.")
        self.status.setText("Recognition finished. Confirm/correct the seven dropdowns, then click Analyze.")

    def current_hand(self) -> list[str]:
        return [combo.currentText().strip() for combo in self.hand_selectors]

    def selectable_counts(self) -> dict[str, int]:
        return recognition_counts(self.deck.main_counts(), self.deck.sideboard_counts())

    def effective_counts_for_hand(self, hand: list[str]) -> tuple[dict[str, int], list[str]]:
        return analysis_counts_for_hand(self.deck.main_counts(), self.deck.sideboard_counts(), hand)

    def analyze(self) -> None:
        hand = self.current_hand()
        self.parse_deck(rebuild_hand=False)
        effective_counts, sideboard_seen = self.effective_counts_for_hand(hand)
        errors = validate_hand_counts(effective_counts, hand)
        if errors:
            QMessageBox.critical(self, "Hand needs correction", "\n".join(errors))
            return
        play_draw = PlayDraw.DRAW if self.on_draw.isChecked() else PlayDraw.PLAY
        try:
            report = analyze_hand(
                effective_counts,
                hand,
                self.cards,
                play_draw,
                trials=5000,
                seed=20260714,
            )
            report["observed_sideboard_cards"] = sideboard_seen
        except Exception as exc:
            QMessageBox.critical(self, "Analysis failed", str(exc))
            return
        self.output.setPlainText(self.format_report(hand, report))
        self.deep_output.setPlainText(self.format_deep_report(hand, report))
        self.mulligan_output.setPlainText(self.format_mulligan_report(hand, report))
        self.other_output.setPlainText(self.format_other_report(hand, report))
        self.result_tabs.setCurrentIndex(0)
        self.status.setText("Analysis complete.")

    def format_report(self, hand: list[str], report: dict) -> str:
        land_turn_3 = report["land_drop_probabilities"].get("Hit land 3 by turn 3", 0.0)
        land_turn_4 = report["land_drop_probabilities"].get("Hit land 4 by turn 4", 0.0)
        draw_sources = report["hand_draw_sources"]
        library_draw_sources = report["library_draw_sources"]
        next_land_t2 = report["land_probabilities"].get("Next land by turn 2")
        next_land_t3 = report["land_probabilities"].get("Next land by turn 3")
        lines = [
            "OVERVIEW",
            f"- {report['lands_in_hand']} lands, {report['nonlands_in_hand']} nonlands",
            f"- Average nonland mana value: {report['average_mana_value']:.2f}",
            f"- Likely playable spells by turns 1/2/3: {report['early_plays'][1]} / {report['early_plays'][2]} / {report['early_plays'][3]}",
            "",
            "KEEP OR MULLIGAN SIGNALS",
            self.land_sentence(report["lands_in_hand"], land_turn_3, land_turn_4),
            self.card_draw_sentence(draw_sources, library_draw_sources),
            "",
            "KEY CHANCES",
            f"- Find the 3rd land by turn 3: {land_turn_3:.1%}",
            f"- Find the 4th land by turn 4: {land_turn_4:.1%}",
        ]
        observed_sideboard = report.get("observed_sideboard_cards", [])
        if observed_sideboard:
            lines.insert(
                4,
                "- Observed sideboard card(s): "
                + ", ".join(observed_sideboard)
                + ". Included observed copy/copies, without guessing which main-deck card was sideboarded out.",
            )

        if next_land_t2 and next_land_t3:
            lines.append(f"- Draw at least one land by turn 2: {next_land_t2.probability:.1%}")
            lines.append(f"- Draw at least one land by turn 3: {next_land_t3.probability:.1%}")

        land_names = [name for name in hand if self.cards.get(name) and self.cards[name].is_land]
        spell_names = [name for name in hand if self.cards.get(name) and not self.cards[name].is_land]
        lines.extend(["", "MANA CHECK"])
        if land_names:
            lines.append("- Lands recognized in hand: " + ", ".join(land_names))
        else:
            lines.append("- No lands recognized in hand. Check card data lookup or manually correct the hand.")
        if spell_names:
            lines.append("- Spells in hand:")
            for name in spell_names:
                card = self.cards[name]
                cost = card.mana_cost or "no mana cost"
                lines.append(f"  {name}: mana value {card.mana_value:g}, cost {cost}")

        lines.extend(["", "CARD DRAW AND LOOKS"])
        if draw_sources:
            for source in draw_sources:
                lines.append(
                    f"- {source.card_name}: sees about {source.cards_seen} card(s) deep "
                    f"and draws {source.cards_drawn} card(s) if cast."
                )
            for turn, impact in report["card_draw_impact"].items():
                natural = impact["next_land_natural"]
                adjusted = impact["next_land_with_hand_draw"]
                extra = impact["expected_extra_looks"]
                if extra > 0.01:
                    lines.append(
                        f"- By turn {turn}: next-land chance changes from {natural:.1%} to about {adjusted:.1%} "
                        f"({extra:.2f} expected extra look(s))."
                    )
        else:
            lines.append("- No clear card-draw spell is currently in the confirmed hand.")
        if library_draw_sources:
            names = ", ".join(f"{source.card_name} ({source.cards_seen} deep)" for source in library_draw_sources[:8])
            more = "" if len(library_draw_sources) <= 8 else f", plus {len(library_draw_sources) - 8} more"
            lines.append(f"- Draw/look cards still in the library: {names}{more}.")
        else:
            lines.append("- No clear card-draw sources were found in the remaining library from available card text.")
        lines.append(
            "- These adjustments estimate extra looks from castable spells. Exact baseline odds are in Deep Data."
        )

        lines.extend(["", "SPELL CASTABILITY"])
        for estimate in report["castability"]:
            values = ", ".join(f"T{turn}: {min(1.0, value):.1%}" for turn, value in estimate.by_turn.items() if turn <= 3)
            lines.append(f"- {estimate.card_name}: {values}")

        lines.extend(["", "CONFIRMED HAND", ", ".join(hand)])
        return "\n".join(lines)

    def format_deep_report(self, hand: list[str], report: dict) -> str:
        lines = [
            "DEEP DATA",
            f"- Remaining library: {report['library_size']} cards",
            f"- Lands remaining: {report['lands_remaining']}",
            "",
            "LAND DETAILS",
        ]
        for detail in report["land_probabilities"].values():
            lines.append(
                f"- {detail.label}: {detail.probability:.1%} "
                f"({detail.qualifying_cards} lands, {detail.draws} draw(s), exact)"
            )
        for label, value in report["land_drop_probabilities"].items():
            lines.append(f"- {label}: {value:.1%} (exact)")

        lines.extend(["", "DRAW TYPES BY TURN"])
        for category, details in report["category_probabilities"].items():
            if category not in {"Land", "Creature", "Instant", "Sorcery", "Noncreature spell"}:
                continue
            values = ", ".join(f"T{idx + 2}: {detail.probability:.1%}" for idx, detail in enumerate(details))
            lines.append(f"- {category}: {values}")

        lines.extend(["", "SPELL CASTABILITY ESTIMATES"])
        for estimate in report["castability"]:
            values = ", ".join(f"T{turn}: {min(1.0, value):.1%}" for turn, value in estimate.by_turn.items())
            lines.append(f"- {estimate.card_name}: {values} ({estimate.trials} seeded trials)")

        lines.extend(["", "DRAW SPELL MODEL"])
        draw_sources = report["hand_draw_sources"]
        if draw_sources:
            for source in draw_sources:
                lines.append(f"- {source.card_name}: draws {source.cards_drawn}, sees {source.cards_seen} card(s) deep.")
            for turn, impact in report["card_draw_impact"].items():
                lines.append(
                    f"- Turn {turn}: natural draws {impact['natural_draws']}, "
                    f"expected extra looks {impact['expected_extra_looks']:.2f}, "
                    f"next-land {impact['next_land_natural']:.1%} -> {impact['next_land_with_hand_draw']:.1%}."
                )
        else:
            lines.append("- No draw/look spells in the confirmed hand.")

        lines.extend(["", "CONFIRMED HAND", ", ".join(hand)])
        lines.extend(
            [
                "",
                "Limits: screenshot recognition is a local match score, not a guarantee. "
                "Castability does not model treasures, mana creatures, cost reductions, or alternate costs.",
            ]
        )
        return "\n".join(lines)

    def format_other_report(self, hand: list[str], report: dict) -> str:
        lands = [name for name in hand if self.cards.get(name) and self.cards[name].is_land]
        spells = [name for name in hand if self.cards.get(name) and not self.cards[name].is_land]
        hand_counts = Counter(hand)
        land_turn_3 = report["land_drop_probabilities"].get("Hit land 3 by turn 3", 0.0)
        land_turn_4 = report["land_drop_probabilities"].get("Hit land 4 by turn 4", 0.0)
        castability = {estimate.card_name: estimate for estimate in report["castability"]}
        score = self.hand_texture_score(report, castability)
        available_colors = sorted({color for name in lands for color in self.cards[name].produced_mana})
        required_colors = self.required_colors(spells)
        missing_colors = [color for color in required_colors if color not in available_colors]
        interaction = [name for name in spells if self.is_interaction(self.cards[name])]
        threats = [name for name in spells if self.is_threat(self.cards[name])]
        draw_sources = report["hand_draw_sources"]
        duplicate_cards = [f"{name} x{qty}" for name, qty in hand_counts.items() if qty > 1]

        lines = [
            "OTHER",
            "",
            "COMPETITIVE SNAPSHOT",
            f"- Hand texture score: {score}/100 ({self.score_label(score)})",
            f"- Opening resources: {len(lands)} land(s), {len(spells)} spell(s), {len(draw_sources)} draw/look card(s)",
            f"- Main-deck land ratio after this hand: {report['lands_remaining']}/{report['library_size']} remaining",
            "",
            "MULLIGAN PRESSURE",
            self.mulligan_note(report["lands_in_hand"], land_turn_3, land_turn_4, score),
            self.castability_note(castability),
            "",
            "COLOR CHECK",
        ]
        lines.append("- Available colors from lands in hand: " + (", ".join(available_colors) if available_colors else "none"))
        lines.append("- Spell colors needed now: " + (", ".join(required_colors) if required_colors else "none"))
        if missing_colors:
            lines.append("- Color bottleneck: missing " + ", ".join(missing_colors) + " for at least one card in hand.")
        else:
            lines.append("- No immediate color bottleneck from the confirmed hand.")

        lines.extend(["", "ROLE PIECES"])
        lines.append("- Interaction in hand: " + (", ".join(interaction) if interaction else "none clearly detected"))
        lines.append("- Threats/pressure in hand: " + (", ".join(threats) if threats else "none clearly detected"))
        if draw_sources:
            draw_text = ", ".join(f"{source.card_name} ({source.cards_seen} deep)" for source in draw_sources)
            lines.append("- Selection/card velocity: " + draw_text)
        else:
            lines.append("- Selection/card velocity: none in hand")

        lines.extend(["", "SEQUENCING PROMPTS"])
        lines.extend(self.sequencing_notes(lands, spells, castability))

        lines.extend(["", "HAND SHAPE FLAGS"])
        lines.append("- Duplicate cards: " + (", ".join(duplicate_cards) if duplicate_cards else "none"))
        low_cast = [
            name for name, estimate in castability.items()
            if self.cards.get(name) and self.cards[name].mana_value <= 2 and estimate.by_turn.get(2, 0.0) < 0.5
        ]
        if low_cast:
            lines.append("- Cheap cards that may still be awkward by turn 2: " + ", ".join(low_cast))
        else:
            lines.append("- Cheap cards look reasonably supported by the current mana estimate.")
        return "\n".join(lines)

    def format_mulligan_report(self, hand: list[str], report: dict) -> str:
        castability = {estimate.card_name: estimate for estimate in report["castability"]}
        score = self.hand_texture_score(report, castability)
        land_turn_3 = report["land_drop_probabilities"].get("Hit land 3 by turn 3", 0.0)
        land_turn_4 = report["land_drop_probabilities"].get("Hit land 4 by turn 4", 0.0)
        lines = [
            "MULLIGAN",
            "",
            "CURRENT HAND",
            f"- Hand texture score: {score}/100 ({self.score_label(score)})",
            self.mulligan_note(report["lands_in_hand"], land_turn_3, land_turn_4, score),
            self.castability_note(castability),
            "",
            "FRESH 7, BOTTOM 1",
            *self.mulligan_comparison_lines(hand, score),
            "",
            "HOW TO READ THIS",
            "- This compares your current 7 to a simulated London mulligan to 6.",
            "- Each simulated mulligan draws a fresh random 7 from the full main deck.",
            "- The app then bottoms the card that gives the best hand texture score.",
            "- It does not know matchup, sideboarding, hidden information, or play pattern preferences.",
        ]
        return "\n".join(lines)

    def mulligan_comparison_lines(self, hand: list[str], current_score: int, samples: int = 2500) -> list[str]:
        deck_cards = [name for name, qty in self.deck.main_counts().items() for _ in range(qty)]
        if len(deck_cards) < 7:
            return ["- Not enough main-deck cards to simulate a fresh 7."]
        rng = random.Random(20260714)
        scores: list[int] = []
        bottomed: Counter[str] = Counter()
        land_counts: Counter[int] = Counter()
        for _ in range(samples):
            shuffled = deck_cards[:]
            rng.shuffle(shuffled)
            opening_seven = shuffled[:7]
            kept_six, bottom_card, best_score = self.best_mulligan_six(opening_seven)
            scores.append(best_score)
            bottomed[bottom_card] += 1
            land_counts[sum(1 for name in kept_six if self.cards.get(name) and self.cards[name].is_land)] += 1
        scores.sort()
        average = sum(scores) / len(scores)
        median = scores[len(scores) // 2]
        better = sum(1 for score in scores if score > current_score) / len(scores)
        same_or_better = sum(1 for score in scores if score >= current_score) / len(scores)
        p25 = scores[len(scores) // 4]
        p75 = scores[(len(scores) * 3) // 4]
        common_bottoms = ", ".join(f"{name} ({count / samples:.0%})" for name, count in bottomed.most_common(3))
        common_land_counts = ", ".join(f"{lands} land: {count / samples:.0%}" for lands, count in sorted(land_counts.items()))
        lines = [
            f"- Current hand texture: {current_score}/100.",
            f"- Simulated mulligan-to-six average: {average:.1f}/100; median: {median}/100.",
            f"- Middle half of mulligan outcomes: {p25}/100 to {p75}/100.",
            f"- Fresh 7 then bottom 1 is better than this hand about {better:.1%} of the time.",
            f"- Fresh 7 then bottom 1 is at least as good about {same_or_better:.1%} of the time.",
            f"- Typical kept-six land counts: {common_land_counts}.",
        ]
        if common_bottoms:
            lines.append(f"- Most commonly bottomed cards in the sim: {common_bottoms}.")
        lines.append("- This is a seeded simulation, not exact matchup EV. It assumes you bottom the card with the lowest texture impact.")
        return lines

    def best_mulligan_six(self, opening_seven: list[str]) -> tuple[list[str], str, int]:
        best_hand = opening_seven[:6]
        best_bottom = opening_seven[6]
        best_score = -1
        for index, card_name in enumerate(opening_seven):
            kept = opening_seven[:index] + opening_seven[index + 1 :]
            score = self.texture_score_for_cards(kept)
            if score > best_score:
                best_hand = kept
                best_bottom = card_name
                best_score = score
        return best_hand, best_bottom, best_score

    def texture_score_for_cards(self, hand: list[str]) -> int:
        lands = [name for name in hand if self.cards.get(name) and self.cards[name].is_land]
        spells = [name for name in hand if self.cards.get(name) and not self.cards[name].is_land]
        land_count = len(lands)
        score = 50
        if land_count in {2, 3}:
            score += 18
        elif land_count in {1, 4}:
            score += 2
        else:
            score -= 18
        one_drops = sum(1 for name in spells if self.cards[name].mana_value <= 1 and self.has_current_colors(name, lands))
        two_drops = sum(1 for name in spells if self.cards[name].mana_value <= 2 and self.has_current_colors(name, lands))
        score += min(18, one_drops * 6 + two_drops * 3)
        score += min(12, sum(draw_look_depth(self.cards[name]) for name in spells) * 3)
        nonland_mv = [self.cards[name].mana_value for name in spells]
        average_mv = sum(nonland_mv) / len(nonland_mv) if nonland_mv else 0.0
        if average_mv > 3.0 and land_count < 3:
            score -= 12
        if spells and two_drops == 0:
            score -= 15
        return max(0, min(100, score))

    def has_current_colors(self, spell_name: str, lands: list[str]) -> bool:
        card = self.cards.get(spell_name)
        if not card:
            return False
        required, _generic, _warnings = parse_mana_cost(card.mana_cost)
        available = {color for name in lands for color in self.cards[name].produced_mana}
        return all(color in available for color in required)

    def hand_texture_score(self, report: dict, castability: dict) -> int:
        lands = report["lands_in_hand"]
        score = 50
        if lands in {2, 3}:
            score += 18
        elif lands in {1, 4}:
            score += 2
        else:
            score -= 18
        score += min(18, report["early_plays"][1] * 6 + report["early_plays"][2] * 3)
        if report["hand_draw_sources"]:
            score += min(12, sum(source.cards_seen for source in report["hand_draw_sources"]) * 3)
        if report["average_mana_value"] > 3.0 and lands < 3:
            score -= 12
        if all(estimate.by_turn.get(2, 0.0) < 0.5 for estimate in castability.values()):
            score -= 15
        return max(0, min(100, score))

    def score_label(self, score: int) -> str:
        if score >= 80:
            return "strong keep signal"
        if score >= 65:
            return "reasonable keep signal"
        if score >= 45:
            return "context-dependent"
        return "high mulligan pressure"

    def required_colors(self, spells: list[str]) -> list[str]:
        required: set[str] = set()
        for name in spells:
            card = self.cards.get(name)
            if not card:
                continue
            parsed, _generic, _warnings = parse_mana_cost(card.mana_cost)
            required.update(parsed)
        return sorted(required)

    def is_interaction(self, card: CardData) -> bool:
        text = card.oracle_text.casefold()
        interaction_terms = [
            "counter target",
            "deals",
            "damage to",
            "destroy target",
            "exile target",
            "return target",
            "tap target",
            "can't attack",
            "gets -",
        ]
        return any(term in text for term in interaction_terms)

    def is_threat(self, card: CardData) -> bool:
        type_line = card.type_line
        text = card.oracle_text.casefold()
        return "Creature" in type_line or "Planeswalker" in type_line or "create" in text or "token" in text

    def mulligan_note(self, lands: int, third_land: float, fourth_land: float, score: int) -> str:
        if lands == 0:
            return "- Zero-land hands are usually mulligans unless the format/deck has a very unusual plan."
        if lands == 1:
            return f"- One-land hand: keep pressure is high unless your cheap spells and draw make {third_land:.1%} acceptable."
        if lands == 2:
            return f"- Two-land hand: watch the 3rd-land number ({third_land:.1%}) and whether your one-drops are castable."
        if lands == 3:
            return f"- Three-land hand: generally stable; the 4th-land number is {fourth_land:.1%}."
        if lands >= 5:
            return "- Five-plus lands: high flood risk unless the spells are extremely high impact."
        return f"- Overall mulligan pressure reads as {self.score_label(score)}."

    def castability_note(self, castability: dict) -> str:
        if not castability:
            return "- No nonland spells to evaluate."
        turn_two_ready = [name for name, estimate in castability.items() if estimate.by_turn.get(2, 0.0) >= 0.8]
        if turn_two_ready:
            return "- Reliable early actions by turn 2: " + ", ".join(turn_two_ready)
        return "- The hand may not spend mana efficiently early; check color and land-count pressure."

    def sequencing_notes(self, lands: list[str], spells: list[str], castability: dict) -> list[str]:
        notes: list[str] = []
        shock_lands = [
            name for name in lands
            if "you may pay 2 life" in self.cards[name].oracle_text.casefold()
        ]
        fast_lands = [
            name for name in lands
            if "two or fewer other lands" in self.cards[name].oracle_text.casefold()
        ]
        tapped_lands = [
            name for name in lands
            if "enters tapped" in self.cards[name].oracle_text.casefold()
            and name not in shock_lands
            and name not in fast_lands
        ]
        if shock_lands:
            notes.append("- Shock land option: " + ", ".join(shock_lands) + " can preserve tempo if paying 2 life matters.")
        if fast_lands:
            notes.append("- Fast land timing: " + ", ".join(fast_lands) + " is best early before it risks entering tapped.")
        if tapped_lands:
            notes.append("- Consider leading on tapped land(s) when you do not have a turn-1 spell: " + ", ".join(tapped_lands))
        one_mana_spells = [
            name for name in spells
            if self.cards.get(name) and self.cards[name].mana_value <= 1 and castability.get(name) and castability[name].by_turn.get(1, 0.0) >= 0.8
        ]
        if one_mana_spells:
            notes.append("- Turn-1 options that look live: " + ", ".join(one_mana_spells))
        if not notes:
            notes.append("- No obvious sequencing trap detected from land text and early castability.")
        return notes

    def land_sentence(self, lands_in_hand: int, third_land: float, fourth_land: float) -> str:
        if lands_in_hand >= 4:
            return "- You already have several lands; the main risk to watch is drawing too many more lands."
        if lands_in_hand == 3:
            return f"- This is a three-land hand. The 4th land by turn 4 is {fourth_land:.1%}."
        if lands_in_hand == 2:
            return f"- This is a two-land hand. The 3rd land by turn 3 is {third_land:.1%}."
        return f"- This is a low-land hand. The 3rd land by turn 3 is {third_land:.1%}."

    def card_draw_sentence(self, hand_sources, library_sources) -> str:
        if hand_sources:
            names = ", ".join(source.card_name for source in hand_sources)
            return f"- You have card draw in hand: {names}. The section below estimates how that improves future looks."
        if library_sources:
            return f"- You do not have card draw in hand, but {len(library_sources)} card-draw source(s) remain in the library."
        return "- No clear card-draw effects were found from the available card text."


def main() -> None:
    app = QApplication(sys.argv)
    window = DesktopAnalyzer()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
