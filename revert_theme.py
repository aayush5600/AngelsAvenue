import os
import glob
import re

app_path = "/Users/jeevan/Documents/Angel's Avenue/App/Angel's Avenue/src/app"
files = glob.glob(os.path.join(app_path, "*.tsx"))

theme_block = """
const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};
"""

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    # Remove the import statement
    content = re.sub(r"import\s+\{\s*THEME\s*,\s*SHADOWS\s*\}\s*from\s*'../theme';\n?", "", content)
    content = re.sub(r"import\s+\{\s*THEME\s*\}\s*from\s*'../theme';\n?", "", content)

    # Remove ...SHADOWS.small,
    content = re.sub(r"\.\.\.SHADOWS\.small,?\n?", "", content)
    content = re.sub(r"\.\.\.SHADOWS\.medium,?\n?", "", content)

    # Change barStyle="dark-content" to "light-content"
    content = content.replace('barStyle="dark-content"', 'barStyle="light-content"')

    # Only add THEME if it's not already there
    if "const THEME = {" not in content:
        # Find the last import
        lines = content.split('\n')
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import_idx = i
        
        if last_import_idx != -1:
            lines.insert(last_import_idx + 1, theme_block)
        else:
            lines.insert(0, theme_block)
        
        content = '\n'.join(lines)

    # Fix UI components I added if they exist in the file (AppHeader etc)
    # The files from Phase 1 & 2 shouldn't have AppHeader because the previous agent didn't write it.
    # But wait, did they?
    # I will do a quick check

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Reverted theme in {os.path.basename(filepath)}")
