# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow==11.3.0"]
# ///
"""Arrange the actual Cycles masters; no generated or painted character pixels.

Run outside Blender: uv run blender/compose_turnaround.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIEWS = [('front', 'FRONT'), ('side', 'SIDE'), ('back', 'BACK'),
         ('three-quarter', 'THREE-QUARTER')]


def compose():
    sheet = Image.new('RGB', (2048, 1024))
    fonts = [Path('/System/Library/Fonts/Helvetica.ttc'),
             Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
    font_path = next((f for f in fonts if f.exists()), None)
    font = ImageFont.truetype(str(font_path), 22) if font_path else ImageFont.load_default(size=22)
    for i, (slug, label) in enumerate(VIEWS):
        with Image.open(ROOT / 'renders' / (slug + '.png')) as master:
            assert master.size == (1024, 1024), (slug, master.size)
            sheet.paste(master.convert('RGB').crop((256, 0, 768, 1024)), (i * 512, 0))
        draw = ImageDraw.Draw(sheet)
        tracking = 2
        width = sum(draw.textlength(char, font=font) for char in label) + tracking * (len(label) - 1)
        x = i * 512 + (512 - width) / 2
        for char in label:
            draw.text((x, 962), char, font=font, fill='#7E7A74')
            x += draw.textlength(char, font=font) + tracking
    sheet.save(ROOT / 'renders' / 'turnaround.png')
    print('Wrote 2048x1024 turnaround from the four unretouched Cycles masters.')
    for slug, expected in [(v[0], (1024, 1024)) for v in VIEWS] + [('hero', (768, 1024))]:
        with Image.open(ROOT / 'renders' / (slug + '.png')) as picture:
            picture.load()
            assert picture.size == expected
            assert picture.mode == 'RGB'
    print('PASS: five readable RGB PNGs at the expected final dimensions.')


if __name__ == '__main__':
    compose()
