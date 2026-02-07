# generate_ogp_script.py
# OGP画像の自動生成 + HTMLへのOGPメタタグ挿入スクリプト
#
# 使い方:
#   python generate_ogp_script.py              # 画像生成 + タグ挿入
#   python generate_ogp_script.py --preview    # 画像生成 + プレビューHTML作成 + ブラウザで開く
#   python generate_ogp_script.py --images-only # 画像のみ生成（HTMLは変更しない）
#   python generate_ogp_script.py --force      # 既存ogp.pngも強制再生成
#   python generate_ogp_script.py --tool NAME  # 特定ツールのみ処理

import os
import sys
import re
import argparse
from pathlib import Path
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

# ============================================================
# 定数
# ============================================================
OGP_WIDTH = 1200
OGP_HEIGHT = 630
OGP_FILENAME = "ogp.png"
PREVIEW_FILENAME = "_preview_ogp.html"

# スキャン除外ディレクトリ
SKIP_DIRS = {'.github', '_assets', 'docs', 'node_modules', '__pycache__'}

# OGP画像の配色 (1-G: ソフトオーロラ ベース)
BG_GRADIENT_START = (255, 241, 235)   # #fff1eb (warm cream)
BG_GRADIENT_END = (172, 224, 249)     # #ace0f9 (light sky blue)
TEXT_COLOR = (91, 83, 95)             # #5b535f (dark purplish-gray)
SUBTITLE_COLOR = (120, 110, 125)      # やや薄いテキスト
LABEL_COLOR = (140, 130, 148)         # 控えめなラベル色
DATE_COLOR = (140, 130, 148)          # フッター日付色

# サイト情報
SITE_LABEL = "kiyo.bio"
DEFAULT_BASE_URL = "https://kiyo.bio/Tools"


# ============================================================
# ベースURL
# ============================================================
def get_base_url():
    """OGP画像の絶対URLに使うベースURLを決定する"""
    site_base_url = os.environ.get('SITE_BASE_URL')
    if site_base_url:
        return site_base_url.rstrip('/')

    github_repo_env = os.environ.get('GITHUB_REPOSITORY')
    if github_repo_env:
        owner = github_repo_env.split('/')[0]
        repo = github_repo_env.split('/')[-1]
        return f"https://{owner}.github.io/{repo}"

    return DEFAULT_BASE_URL


# ============================================================
# フォント解決
# ============================================================
def resolve_font(size):
    """バンドルフォント → システムフォントの順でフォントを探す"""
    script_dir = Path(__file__).parent
    bundled_font = script_dir / "_assets" / "fonts" / "NotoSansJP-Bold.ttf"

    if bundled_font.exists():
        font = ImageFont.truetype(str(bundled_font), size)
        # variable fontの場合、Bold相当のweightを設定
        try:
            font.set_variation_by_axes([700])
        except Exception:
            pass  # static fontやvariable font非対応の場合はスキップ
        return font

    # システムフォントのフォールバック
    system_font_paths = [
        # Ubuntu (GitHub Actions: fonts-noto-cjk)
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        # Windows
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/YuGothB.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        # macOS
        "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
        "/Library/Fonts/NotoSansCJKjp-Bold.otf",
    ]

    for path in system_font_paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)

    print("WARNING: 日本語フォントが見つかりません。テキストが正しく表示されない可能性があります。")
    print("  _assets/fonts/ にNotoSansJP-Bold.ttfを配置するか、")
    print("  sudo apt-get install fonts-noto-cjk (Ubuntu) を実行してください。")
    return ImageFont.load_default()


# ============================================================
# HTMLメタデータ抽出
# ============================================================
def get_html_metadata(html_file_path):
    """HTMLファイルからtitle, description, category, last-updatedを抽出する"""
    metadata = {
        "title": None,
        "description": None,
        "category": None,
        "last_updated": None,
        "has_ogp": False,
    }
    try:
        with open(html_file_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')

        title_tag = soup.find('title')
        if title_tag and title_tag.string:
            metadata["title"] = title_tag.string.strip()

        desc_meta = soup.find('meta', attrs={'name': 'description'})
        if desc_meta and desc_meta.get('content'):
            metadata["description"] = desc_meta['content'].strip()

        category_meta = soup.find('meta', attrs={'name': 'category'})
        if category_meta and category_meta.get('content'):
            metadata["category"] = category_meta['content'].strip()

        last_updated_meta = soup.find('meta', attrs={'name': 'last-updated'})
        if last_updated_meta and last_updated_meta.get('content'):
            metadata["last_updated"] = last_updated_meta['content'].strip()

        og_title = soup.find('meta', attrs={'property': 'og:title'})
        if og_title:
            metadata["has_ogp"] = True

    except FileNotFoundError:
        print(f"  WARNING: {html_file_path} が見つかりません")
    except Exception as e:
        print(f"  ERROR: {html_file_path} の解析に失敗: {e}")

    return metadata


# ============================================================
# テキスト折り返し（日本語対応）
# ============================================================
def _char_type(ch):
    """文字の種別を返す（改行位置判定用）"""
    cp = ord(ch)
    if 0x3040 <= cp <= 0x309F: return 'hira'
    if 0x30A0 <= cp <= 0x30FF: return 'kata'
    if 0x4E00 <= cp <= 0x9FFF: return 'kanji'
    if 0xFF01 <= cp <= 0xFF5E: return 'fullwidth'  # 全角英数
    if ch.isascii() and ch.isalpha(): return 'alpha'
    if ch.isascii() and ch.isdigit(): return 'digit'
    return 'other'


def _find_natural_breaks(text):
    """テキスト内の自然な改行位置とスコアを返す。
    Returns: list of (position, score)
      position = 新しい行の開始インデックス
      score = 改行の自然さ (高い=より自然)
    """
    break_after_chars = set('。、，,.!?！？）」』】〉》・：:→←')
    break_before_chars = set('（「『【〈《')

    breaks = []
    for i in range(1, len(text)):
        prev_ch = text[i - 1]
        ch = text[i]
        score = 0

        # スペース: 最も自然な改行位置
        if prev_ch in (' ', '\u3000'):
            score = 4
        # 句読点・記号の後
        elif prev_ch in break_after_chars:
            score = 3
        # 開き括弧の前
        elif ch in break_before_chars:
            score = 2
        else:
            # 文字種の切り替わり = 単語境界
            prev_t = _char_type(prev_ch)
            curr_t = _char_type(ch)
            if prev_t != curr_t:
                # カタカナ↔漢字 (リンク|生成、変換|ツール)
                if {prev_t, curr_t} <= {'kata', 'kanji'}:
                    score = 2
                # 英数字↔日本語 (ZIP|変換、URL|を)
                elif {prev_t, curr_t} & {'alpha', 'digit'} and \
                     {prev_t, curr_t} & {'hira', 'kata', 'kanji'}:
                    score = 2
                # ひらがな↔漢字/カタカナ
                elif prev_t != 'other' and curr_t != 'other':
                    score = 1

        if score > 0:
            breaks.append((i, score))

    return breaks


def _text_width(draw, text, font):
    """テキストの描画幅を計算する"""
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def _choose_layout(draw, text, max_width, font_sizes, max_lines=2):
    """自然な改行位置を先に決定し、それが収まる最大フォントサイズを選ぶ。

    従来: フォントサイズ→改行位置 (フォント次第で変な位置に改行)
    改善: 改行位置→フォントサイズ (自然な位置で改行してから文字サイズ調整)
    """
    breaks = _find_natural_breaks(text)

    # 行頭禁則文字（これらで行が始まってはいけない）
    NO_LINE_START = set('。、，,.!?！？）」』】〉》・：:→←ー')

    # 候補分割を生成: 1行 + 各改行位置での2行分割
    # (lines, score) のリスト
    candidates = [([text], 5)]  # 1行は最高スコア

    for pos, score in breaks:
        line1 = text[:pos].rstrip()
        line2 = text[pos:].lstrip()
        if line1 and line2 and line2[0] not in NO_LINE_START:
            candidates.append(([line1, line2], score))

    # 各フォントサイズで、収まる分割を探す（大きいサイズから）
    for sz in font_sizes:
        font = resolve_font(sz)

        # 収まる候補を集める
        valid = []
        for lines, score in candidates:
            if len(lines) > max_lines:
                continue
            fits = all(_text_width(draw, line, font) <= max_width for line in lines)
            if fits:
                # 1行目の幅（大きいほど見栄え良い＝センタリングで安定）
                w1 = _text_width(draw, lines[0], font)
                valid.append((score, w1, lines))

        if valid:
            # スコア最高 → 同スコアなら1行目が長いものを優先
            valid.sort(key=lambda x: (x[0], x[1]), reverse=True)
            return font, valid[0][2]

    # 最小フォントでも自然な位置で収まらない → 強制折り返し
    font = resolve_font(font_sizes[-1])
    lines = _wrap_text_fallback(draw, text, font, max_width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][:-1] + "\u2026"
    return font, lines


def _wrap_text_fallback(draw, text, font, max_width):
    """フォールバック: 自然な位置で収まらない場合の強制折り返し"""
    bbox = draw.textbbox((0, 0), text, font=font)
    if bbox[2] - bbox[0] <= max_width:
        return [text]

    lines = []
    start = 0
    while start < len(text):
        remaining = text[start:]
        if _text_width(draw, remaining, font) <= max_width:
            lines.append(remaining)
            break

        # 収まる最大の位置を探す
        best_pos = start + 1
        for i in range(start + 1, len(text)):
            segment = text[start:i + 1]
            if _text_width(draw, segment, font) > max_width:
                best_pos = i
                break
            best_pos = i + 1

        lines.append(text[start:best_pos])
        start = best_pos

    return lines


# ============================================================
# OGP画像生成
# ============================================================
def _draw_diagonal_gradient(img):
    """135度（左上→右下）のソフトオーロラグラデーションを描画する"""
    import math
    w, h = img.size
    # 135度 = 左上から右下への対角線
    # ピクセルごとにグラデーション比率を計算
    diag_len = math.sqrt(w * w + h * h)
    cos_a = math.cos(math.radians(135))
    sin_a = math.sin(math.radians(135))

    pixels = img.load()
    for y in range(h):
        for x in range(w):
            # 135度方向の投影距離を正規化
            proj = (x * cos_a + y * sin_a)
            ratio = (proj - (-diag_len * 0.5)) / (diag_len * 0.7)
            ratio = max(0.0, min(1.0, ratio))
            r = int(BG_GRADIENT_START[0] + (BG_GRADIENT_END[0] - BG_GRADIENT_START[0]) * ratio)
            g = int(BG_GRADIENT_START[1] + (BG_GRADIENT_END[1] - BG_GRADIENT_START[1]) * ratio)
            b = int(BG_GRADIENT_START[2] + (BG_GRADIENT_END[2] - BG_GRADIENT_START[2]) * ratio)
            pixels[x, y] = (r, g, b)


def generate_ogp_image(title, description, category, last_updated, output_path):
    """1200x630pxのOGP画像を生成する（ソフトオーロラ + アイキャッチレイアウト）"""
    img = Image.new('RGB', (OGP_WIDTH, OGP_HEIGHT))

    # --- 135度グラデーション背景（ソフトオーロラ） ---
    _draw_diagonal_gradient(img)

    draw = ImageDraw.Draw(img)
    padding = 40  # アイキャッチと同じ40px padding

    # --- ガラスモーフィズムのメインコンテンツボックス ---
    glass_margin_top = 90
    glass_margin_bottom = 80
    glass_overlay = Image.new('RGBA', (OGP_WIDTH, OGP_HEIGHT), (0, 0, 0, 0))
    glass_draw = ImageDraw.Draw(glass_overlay)
    glass_draw.rounded_rectangle(
        [padding, glass_margin_top, OGP_WIDTH - padding, OGP_HEIGHT - glass_margin_bottom],
        radius=20,
        fill=(255, 255, 255, 100)
    )
    # ガラスボーダー
    glass_draw.rounded_rectangle(
        [padding, glass_margin_top, OGP_WIDTH - padding, OGP_HEIGHT - glass_margin_bottom],
        radius=20,
        outline=(255, 255, 255, 153),
        width=1
    )
    img = Image.alpha_composite(img.convert('RGBA'), glass_overlay).convert('RGB')
    draw = ImageDraw.Draw(img)

    # --- フォント読み込み（固定サイズ） ---
    label_font = resolve_font(24)
    badge_font = resolve_font(20)
    date_font = resolve_font(20)

    content_left = padding + 30
    content_right = OGP_WIDTH - padding - 30
    glass_top = glass_margin_top
    glass_bottom = OGP_HEIGHT - glass_margin_bottom

    # ============================================================
    # ヘッダー: kiyo.bio (左) + カテゴリバッジ (右)
    # ============================================================
    header_y = padding + 6
    # 左上: kiyo.bio
    draw.text((content_left, header_y), SITE_LABEL, font=label_font, fill=LABEL_COLOR)

    # 右上: カテゴリバッジ（pill型）
    if category:
        badge_bbox = draw.textbbox((0, 0), category, font=badge_font)
        badge_text_w = badge_bbox[2] - badge_bbox[0]
        badge_text_h = badge_bbox[3] - badge_bbox[1]
        badge_pad_x = 18
        badge_pad_y = 7
        badge_w = badge_text_w + badge_pad_x * 2
        badge_h = badge_text_h + badge_pad_y * 2
        badge_x = content_right - badge_w
        badge_y = header_y - 3

        # pill型バッジ背景（半透明白）
        badge_overlay = Image.new('RGBA', (OGP_WIDTH, OGP_HEIGHT), (0, 0, 0, 0))
        badge_overlay_draw = ImageDraw.Draw(badge_overlay)
        badge_overlay_draw.rounded_rectangle(
            [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
            radius=badge_h,  # pill型: radius = height
            fill=(255, 255, 255, 77)
        )
        img = Image.alpha_composite(img.convert('RGBA'), badge_overlay).convert('RGB')
        draw = ImageDraw.Draw(img)

        draw.text(
            (badge_x + badge_pad_x, badge_y + badge_pad_y),
            category, font=badge_font, fill=TEXT_COLOR
        )

    # ============================================================
    # メインコンテンツ: タイトル + 説明文（ガラスボックス内、上下中央）
    # ============================================================
    inner_top = glass_top + 25
    inner_bottom = glass_bottom - 25
    inner_left = padding + 35
    inner_right = OGP_WIDTH - padding - 35
    inner_max_width = inner_right - inner_left

    # --- 自然な改行位置を先に決め、収まるフォントサイズを選ぶ ---
    title_text = title or "Untitled Tool"
    TITLE_SIZES = [90, 80, 72, 64, 56]
    title_font, title_lines = _choose_layout(draw, title_text, inner_max_width, TITLE_SIZES, max_lines=2)

    DESC_SIZES = [40, 36, 32, 28]
    desc_font = resolve_font(DESC_SIZES[-1])
    desc_lines = []
    if description:
        desc_font, desc_lines = _choose_layout(draw, description, inner_max_width, DESC_SIZES, max_lines=2)

    # コンテンツ全体の高さを計算して垂直中央配置
    title_line_h = 0
    if title_lines:
        sample_bbox = draw.textbbox((0, 0), title_lines[0], font=title_font)
        title_line_h = sample_bbox[3] - sample_bbox[1]
    desc_line_h = 0
    if desc_lines:
        sample_bbox = draw.textbbox((0, 0), desc_lines[0], font=desc_font)
        desc_line_h = sample_bbox[3] - sample_bbox[1]

    title_spacing = 14
    desc_spacing = 10
    gap_between = 50  # タイトルと説明文の間

    total_height = (
        title_line_h * len(title_lines) + title_spacing * max(0, len(title_lines) - 1)
    )
    if desc_lines:
        total_height += gap_between
        total_height += desc_line_h * len(desc_lines) + desc_spacing * max(0, len(desc_lines) - 1)

    available_height = inner_bottom - inner_top
    start_y = inner_top + (available_height - total_height) // 2

    # テキストシャドウ色（白ベースの背景用、アイキャッチと同じ）
    shadow_color = (255, 255, 255, 102)  # rgba(255,255,255,0.4)

    # タイトル描画（センタリング）
    content_center_x = inner_left + inner_max_width // 2
    cursor_y = start_y
    for line in title_lines:
        line_bbox = draw.textbbox((0, 0), line, font=title_font)
        line_w = line_bbox[2] - line_bbox[0]
        line_x = content_center_x - line_w // 2
        # テキストシャドウ
        shadow_img = Image.new('RGBA', (OGP_WIDTH, OGP_HEIGHT), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow_img)
        shadow_draw.text((line_x + 2, cursor_y + 2), line, font=title_font, fill=shadow_color)
        img = Image.alpha_composite(img.convert('RGBA'), shadow_img).convert('RGB')
        draw = ImageDraw.Draw(img)
        # メインテキスト
        draw.text((line_x, cursor_y), line, font=title_font, fill=TEXT_COLOR)
        cursor_y += title_line_h + title_spacing

    # 説明文描画（センタリング）
    if desc_lines:
        cursor_y += gap_between - title_spacing  # 上のspacing分を調整
        for line in desc_lines:
            line_bbox = draw.textbbox((0, 0), line, font=desc_font)
            line_w = line_bbox[2] - line_bbox[0]
            line_x = content_center_x - line_w // 2
            draw.text((line_x, cursor_y), line, font=desc_font, fill=SUBTITLE_COLOR)
            cursor_y += desc_line_h + desc_spacing

    # ============================================================
    # フッター: 更新日（右寄せ）
    # ============================================================
    if last_updated:
        date_text = f"{last_updated} 更新"
        date_bbox = draw.textbbox((0, 0), date_text, font=date_font)
        date_w = date_bbox[2] - date_bbox[0]
        date_x = content_right - date_w
        date_y = OGP_HEIGHT - glass_margin_bottom + 15
        draw.text((date_x, date_y), date_text, font=date_font, fill=DATE_COLOR)

    # --- 保存 ---
    img.save(output_path, 'PNG', optimize=True)
    print(f"  生成: {output_path}")


# ============================================================
# OGPタグ挿入
# ============================================================
def insert_ogp_tags(html_file_path, tool_dir_name, title, description, base_url):
    """HTMLファイルにOGP/Twitter Cardメタタグを挿入する（冪等）"""
    with open(html_file_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    # 冪等性チェック: og:titleが既に存在すればスキップ
    if 'og:title' in html_content:
        print(f"  スキップ（OGPタグ既存）: {html_file_path}")
        return False

    tool_url = f"{base_url}/{tool_dir_name}/"
    image_url = f"{base_url}/{tool_dir_name}/{OGP_FILENAME}"

    # OGPタグブロックを構築
    ogp_lines = [
        '',
        '    <!-- OGP / Twitter Card -->',
        f'    <meta property="og:title" content="{_escape_attr(title or tool_dir_name)}">',
        f'    <meta property="og:description" content="{_escape_attr(description or "")}">',
        f'    <meta property="og:image" content="{image_url}">',
        f'    <meta property="og:url" content="{tool_url}">',
        '    <meta property="og:type" content="website">',
        '    <meta property="og:site_name" content="kiyo.bio">',
        f'    <meta property="og:image:width" content="{OGP_WIDTH}">',
        f'    <meta property="og:image:height" content="{OGP_HEIGHT}">',
        f'    <meta name="twitter:card" content="summary_large_image">',
        f'    <meta name="twitter:title" content="{_escape_attr(title or tool_dir_name)}">',
        f'    <meta name="twitter:description" content="{_escape_attr(description or "")}">',
        f'    <meta name="twitter:image" content="{image_url}">',
    ]
    ogp_block = '\n'.join(ogp_lines)

    # 挿入位置: <meta name="description" ...> の直後
    desc_pattern = r'(<meta\s+name="description"[^>]*>)'
    match = re.search(desc_pattern, html_content, re.DOTALL)

    if match:
        insert_pos = match.end()
    else:
        # フォールバック: </title> の直後
        title_end = html_content.find('</title>')
        if title_end != -1:
            insert_pos = title_end + len('</title>')
        else:
            print(f"  ERROR: 挿入位置が見つかりません: {html_file_path}")
            return False

    new_content = html_content[:insert_pos] + ogp_block + html_content[insert_pos:]

    with open(html_file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"  OGPタグ挿入: {html_file_path}")
    return True


def _escape_attr(text):
    """HTML属性値のエスケープ"""
    return text.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


# ============================================================
# プレビューHTML生成
# ============================================================
def generate_preview_html(tools_data, output_path):
    """OGP画像一覧のプレビューHTMLを生成する"""
    cards_html = ""
    for tool in tools_data:
        img_path = f"{tool['dir_name']}/{OGP_FILENAME}"
        cards_html += f"""    <div class="card">
      <h2>{tool['dir_name']}</h2>
      <img src="{img_path}" alt="OGP: {tool['dir_name']}">
      <div class="meta"><strong>Title:</strong> {tool.get('title', 'N/A')}</div>
      <div class="meta"><strong>Description:</strong> {tool.get('description', 'N/A')}</div>
      <div class="meta"><strong>Category:</strong> {tool.get('category', 'N/A')}</div>
      <div class="meta"><strong>Last Updated:</strong> {tool.get('last_updated', 'N/A')}</div>
    </div>
"""

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>OGP Image Preview</title>
  <style>
    body {{ font-family: 'Segoe UI', sans-serif; background: #f0f2f5; padding: 20px; margin: 0; }}
    h1 {{ color: #333; margin-bottom: 4px; }}
    .timestamp {{ color: #888; font-size: 14px; margin-bottom: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(580px, 1fr)); gap: 24px; }}
    .card {{ background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
    .card h2 {{ margin: 0 0 12px; font-size: 16px; color: #555; }}
    .card img {{ width: 100%; border-radius: 8px; border: 1px solid #e0e0e0; }}
    .card .meta {{ font-size: 13px; color: #666; margin-top: 8px; line-height: 1.5; }}
  </style>
</head>
<body>
  <h1>OGP Image Preview</h1>
  <div class="timestamp">Generated: <script>document.write(new Date().toLocaleString('ja-JP'))</script></div>
  <div class="grid">
{cards_html}  </div>
</body>
</html>"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"プレビューHTML生成: {output_path}")


# ============================================================
# ツール探索
# ============================================================
def discover_tools():
    """ルートディレクトリからツールディレクトリを探索する（generate_list_script.pyと同じロジック）"""
    tools = []
    for item_name in sorted(os.listdir(".")):
        if not os.path.isdir(item_name):
            continue
        if item_name.startswith('.') or item_name.startswith('_'):
            continue
        if item_name in SKIP_DIRS:
            continue

        html_path = os.path.join(item_name, "index.html")
        if os.path.exists(html_path):
            metadata = get_html_metadata(html_path)
            tools.append({
                "dir_name": item_name,
                "html_path": html_path,
                "title": metadata["title"],
                "description": metadata["description"],
                "category": metadata["category"],
                "last_updated": metadata["last_updated"],
                "has_ogp": metadata["has_ogp"],
            })
    return tools


# ============================================================
# メイン
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="OGP画像の生成とメタタグの挿入")
    parser.add_argument('--preview', action='store_true',
                        help='プレビューHTMLを生成してブラウザで開く')
    parser.add_argument('--images-only', action='store_true',
                        help='画像のみ生成（HTMLは変更しない）')
    parser.add_argument('--tags-only', action='store_true',
                        help='OGPタグのみ挿入（画像は生成しない）')
    parser.add_argument('--tool', type=str, default=None,
                        help='特定のツールディレクトリのみ処理')
    parser.add_argument('--force', action='store_true',
                        help='既存のogp.pngも強制再生成')
    args = parser.parse_args()

    base_url = get_base_url()
    print(f"Base URL: {base_url}")

    tools = discover_tools()

    if args.tool:
        tools = [t for t in tools if t['dir_name'] == args.tool]
        if not tools:
            print(f"ERROR: ツール '{args.tool}' が見つかりません")
            sys.exit(1)

    print(f"{len(tools)} 件のツールを検出\n")

    generated = 0
    skipped_img = 0
    inserted = 0
    skipped_tag = 0
    errors = 0

    for tool in tools:
        print(f"処理中: {tool['dir_name']}")
        ogp_path = os.path.join(tool['dir_name'], OGP_FILENAME)

        # 画像生成
        if not args.tags_only:
            if args.force or not os.path.exists(ogp_path):
                try:
                    generate_ogp_image(
                        tool['title'],
                        tool['description'],
                        tool['category'],
                        tool['last_updated'],
                        ogp_path
                    )
                    generated += 1
                except Exception as e:
                    print(f"  ERROR: 画像生成失敗: {e}")
                    errors += 1
            else:
                print(f"  スキップ（ogp.png既存）: {ogp_path}")
                skipped_img += 1

        # タグ挿入
        if not args.images_only:
            if not tool['has_ogp']:
                try:
                    result = insert_ogp_tags(
                        tool['html_path'],
                        tool['dir_name'],
                        tool['title'],
                        tool['description'],
                        base_url
                    )
                    if result:
                        inserted += 1
                    else:
                        skipped_tag += 1
                except Exception as e:
                    print(f"  ERROR: タグ挿入失敗: {e}")
                    errors += 1
            else:
                print(f"  スキップ（OGPタグ既存）: {tool['html_path']}")
                skipped_tag += 1

    # サマリー
    print(f"\n--- サマリー ---")
    print(f"ツール数: {len(tools)}")
    if not args.tags_only:
        print(f"画像生成: {generated}, スキップ: {skipped_img}")
    if not args.images_only:
        print(f"タグ挿入: {inserted}, スキップ: {skipped_tag}")
    if errors > 0:
        print(f"エラー: {errors}")

    # プレビュー
    if args.preview:
        preview_path = PREVIEW_FILENAME
        generate_preview_html(tools, preview_path)
        try:
            import webbrowser
            webbrowser.open(os.path.abspath(preview_path))
        except Exception:
            print(f"ブラウザの自動オープンに失敗しました。手動で開いてください: {preview_path}")


if __name__ == "__main__":
    main()
