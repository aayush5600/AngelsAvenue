import os
import glob
import re

files = glob.glob("/Users/jeevan/Documents/Angel's Avenue/App/Angel's Avenue/src/app/*.tsx")

theme_pattern = re.compile(r"const THEME = \{[^}]+\};")
statusbar_pattern = re.compile(r"barStyle=[\"']light-content[\"']")
activity_indicator_pattern = re.compile(r"color=[\"']#d4af37[\"']")

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    # Skip if already imported
    if "import { THEME" in content:
        continue

    # Remove inline THEME
    new_content = theme_pattern.sub("", content)

    # Change StatusBar to dark-content
    new_content = statusbar_pattern.sub("barStyle=\"dark-content\"", new_content)

    # Change hardcoded gold activity indicators to THEME.accent
    new_content = activity_indicator_pattern.sub("color={THEME.accent}", new_content)

    # Add import statement after the last import
    lines = new_content.split('\n')
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith('import '):
            last_import_idx = i
    
    if last_import_idx != -1:
        lines.insert(last_import_idx + 1, "import { THEME, SHADOWS } from '../theme';")
    else:
        lines.insert(0, "import { THEME, SHADOWS } from '../theme';")

    new_content = '\n'.join(lines)

    # Optional: add SHADOWS to cards
    # This is a bit harder to regex perfectly, but we can look for `backgroundColor: THEME.cardBg,` and append `...SHADOWS.small,`
    new_content = new_content.replace(
        "backgroundColor: THEME.cardBg,",
        "backgroundColor: THEME.cardBg,\n    ...SHADOWS.small,"
    )

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(filepath)}")

