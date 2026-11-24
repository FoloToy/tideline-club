"""Bundle game/ for file://, the Passport, or the community static route."""
import argparse
import base64
import gzip
from pathlib import Path
import re

def build(game):
    html = (game / "index.html").read_text(encoding="utf-8")
    def javascript(match):
        script = (game / match[1]).read_text(encoding="utf-8")
        return "<script>" + re.sub(r"</script", r"<\\/script", script, flags=re.I) + "</script>"
    html = html.replace('<link rel="stylesheet" href="style.css">',
                        "<style>" + (game / "style.css").read_text(encoding="utf-8") + "</style>")
    image = base64.b64encode((game / "assets/keyart.webp").read_bytes()).decode("ascii")
    html = html.replace('src="assets/keyart.webp"', 'src="data:image/webp;base64,' + image + '"')
    html = re.sub(r'<script src="([^"]+)"></script>', javascript, html)
    license = (game / "assets/THREE-LICENSE.txt").read_text(encoding="utf-8")
    return html.replace("</head>", "<!-- Three.js r160. Copyright Three.js Authors. " + license + " -->\n</head>")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("variant", choices=["offline", "controller", "community"])
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    html = build(Path(__file__).resolve().parent / "game")
    if args.variant == "community":
        html = html.replace('class="crumb">玩法社区', 'class="crumb"><a style="color:inherit" href="/plays/">玩法社区</a>')
    if args.variant == "controller":
        html = html.replace('<html lang="zh-CN">','<html lang="zh-CN" data-controller="on">')
        content = gzip.compress(html.encode("utf-8"), compresslevel=9, mtime=0)
    else:
        content = html.encode("utf-8")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(content)
