#!/usr/bin/env python3
"""
배포용 단일 파일 빌드 스크립트.

개발은 index.html + assets/*.mp3, *.png 로 하고,
사람들에게 나눠줄 땐 이 스크립트로 assets를 다시 base64로 인라인해서
dist/오봉역_양회기지_입환게임.html 하나만 생성합니다.

사용법:
    python3 build.py
"""
import base64
import re
import os

SRC = 'index.html'
OUT_DIR = 'dist'
OUT_FILE = os.path.join(OUT_DIR, '오봉역_양회기지_입환게임.html')

def inline_asset(html, tag_pattern, asset_path, mime, replacement_fn):
    with open(asset_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    return re.sub(tag_pattern, lambda m: replacement_fn(b64), html, count=1)

def main():
    with open(SRC, 'r', encoding='utf-8') as f:
        html = f.read()

    # 오디오 인라인
    html = inline_asset(
        html,
        r'<audio id="bgMusic" loop preload="auto"><source src="assets/bgm\.mp3" type="audio/mpeg"></audio>',
        'assets/bgm.mp3',
        'audio/mpeg',
        lambda b64: f'<audio id="bgMusic" loop preload="auto"><source src="data:audio/mpeg;base64,{b64}" type="audio/mpeg"></audio>'
    )

    # 시작화면 캐릭터 이미지 인라인
    html = inline_asset(
        html,
        r'<img class="start-char-img" src="assets/start-character\.png" alt="">',
        'assets/start-character.png',
        'image/png',
        lambda b64: f'<img class="start-char-img" src="data:image/png;base64,{b64}" alt="">'
    )

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html)

    size_mb = os.path.getsize(OUT_FILE) / (1024*1024)
    print(f'✅ 빌드 완료: {OUT_FILE} ({size_mb:.1f} MB)')
    print('   이 파일 하나만 다운로드/배포하면 됩니다 (브라우저에서 바로 열림).')

if __name__ == '__main__':
    main()
