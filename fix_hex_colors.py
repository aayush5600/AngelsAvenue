import os, glob, re

files = glob.glob("/Users/jeevan/Documents/Angel's Avenue/App/Angel's Avenue/src/app/*.tsx")

replacements = {
    r"['\"]#121212['\"]": "THEME.bg",
    r"['\"]#1c1c1e['\"]": "THEME.cardBg",
    r"['\"]#d4af37['\"]": "THEME.accent",
    r"['\"]#ffffff['\"]": "THEME.textMain",
    r"['\"]#8e8e93['\"]": "THEME.textSub",
    r"['\"]#a0a0a0['\"]": "THEME.textSub",
    r"['\"]#cccccc['\"]": "THEME.textSub",
    r"['\"]#9ca3af['\"]": "THEME.textSub",
    r"['\"]#2c2c2e['\"]": "THEME.border",
    r"['\"]#333333['\"]": "THEME.border",
    r"['\"]#1e1e1e['\"]": "THEME.cardBg", # another shade of dark card used in inputs
}

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    for pattern, repl in replacements.items():
        new_content = re.sub(pattern, repl, new_content, flags=re.IGNORECASE)
        
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Replaced colors in {os.path.basename(filepath)}")

