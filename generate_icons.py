import os
import io
import resvg_py
from PIL import Image

def generate_icons():
    # Base directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    svg_path = os.path.join(base_dir, 'aetherpmo-icon.svg')
    
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_raw = f.read()
    
    print("[1/5] Generating Any-purpose icons (512x512, 192x192)...")
    # 512x512 any icon
    png_512_bytes = resvg_py.svg_to_bytes(svg_raw, width=512, height=512)
    img_512 = Image.open(io.BytesIO(png_512_bytes))
    img_512.save(os.path.join(base_dir, 'icon-512.png'), 'PNG')
    
    # 192x192 any icon
    img_192 = img_512.resize((192, 192), Image.Resampling.LANCZOS)
    img_192.save(os.path.join(base_dir, 'icon-192.png'), 'PNG')
    
    print("[2/5] Generating Apple Touch and Favicon assets...")
    # apple-touch-icon 180x180
    img_180 = img_512.resize((180, 180), Image.Resampling.LANCZOS)
    img_180.save(os.path.join(base_dir, 'apple-touch-icon-180.png'), 'PNG')
    
    # favicon.png 64x64
    img_64 = img_512.resize((64, 64), Image.Resampling.LANCZOS)
    img_64.save(os.path.join(base_dir, 'favicon.png'), 'PNG')
    
    # favicon.ico (multi-resolution: 16, 32, 48, 64)
    ico_path = os.path.join(base_dir, 'favicon.ico')
    img_512.save(ico_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    
    print("[3/5] Generating Maskable SVG and icons (full bleed, safe-zone scaled)...")
    maskable_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="AetherPMO">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#8b5cf6"/>
    <stop offset=".48" stop-color="#4823cf"/>
    <stop offset="1" stop-color="#12074c"/>
  </linearGradient>
  <linearGradient id="a" x1=".1" y1="0" x2=".9" y2="1">
    <stop stop-color="#fff"/>
    <stop offset=".55" stop-color="#e5d8ff"/>
    <stop offset="1" stop-color="#a88bff"/>
  </linearGradient>
  <linearGradient id="bars" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#d4baff"/>
    <stop offset="1" stop-color="#6b37fa"/>
  </linearGradient>
</defs>
<rect width="512" height="512" fill="url(#bg)"/>
<circle cx="166" cy="85" r="360" fill="#a06bff" opacity=".13"/>
<circle cx="487" cy="480" r="355" fill="#130957" opacity=".36"/>
<g transform="translate(256, 256) scale(0.80) translate(-256, -256)">
  <path d="M104 416 231 143q11-23 34-23h16q19 0 29 22l111 274h-76L274 233 182 416z" fill="url(#a)"/>
  <path d="M104 416Q207 274 375 250" stroke="#e4d6ff" stroke-width="26" fill="none" stroke-linecap="round"/>
  <path d="M354 251Q371 257 376 281v84q0 13 20 13" stroke="#d3bbff" stroke-width="13" fill="none" stroke-linecap="round"/>
  <path d="M375 265h38" stroke="#d3bbff" stroke-width="13" stroke-linecap="round"/>
  <path d="M376 321h46" stroke="#d3bbff" stroke-width="13" stroke-linecap="round"/>
  <rect x="398" y="240" width="91" height="46" rx="16" fill="url(#bars)"/>
  <rect x="409" y="298" width="82" height="46" rx="16" fill="url(#bars)"/>
  <rect x="413" y="356" width="76" height="46" rx="16" fill="url(#bars)"/>
  <circle cx="416" cy="263" r="10" fill="#fff"/>
  <circle cx="427" cy="321" r="10" fill="#fff"/>
  <circle cx="431" cy="379" r="10" fill="#fff"/>
</g>
</svg>"""

    # Save maskable svg if useful
    with open(os.path.join(base_dir, 'aetherpmo-icon-maskable.svg'), 'w', encoding='utf-8') as f:
        f.write(maskable_svg)

    maskable_512_bytes = resvg_py.svg_to_bytes(maskable_svg, width=512, height=512)
    img_maskable_512 = Image.open(io.BytesIO(maskable_512_bytes))
    img_maskable_512.save(os.path.join(base_dir, 'icon-512-maskable.png'), 'PNG')
    
    img_maskable_192 = img_maskable_512.resize((192, 192), Image.Resampling.LANCZOS)
    img_maskable_192.save(os.path.join(base_dir, 'icon-192-maskable.png'), 'PNG')
    
    print("[4/5] Verifying generated files:")
    target_files = [
        'icon-512.png',
        'icon-192.png',
        'icon-512-maskable.png',
        'icon-192-maskable.png',
        'apple-touch-icon-180.png',
        'favicon.png',
        'favicon.ico',
        'aetherpmo-icon.svg',
        'aetherpmo-icon-maskable.svg'
    ]
    for filename in target_files:
        filepath = os.path.join(base_dir, filename)
        if os.path.exists(filepath):
            size_kb = os.path.getsize(filepath) / 1024
            print(f"  - {filename:28}: {size_kb:6.2f} KB (OK)")
        else:
            print(f"  - {filename:28}: MISSING!")
            
    print("[5/5] All icon assets generated successfully!")

if __name__ == '__main__':
    generate_icons()
