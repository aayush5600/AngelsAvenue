import os, glob, re

files = glob.glob("/Users/jeevan/Documents/Angel's Avenue/App/Angel's Avenue/src/app/*.tsx")
pattern = re.compile(r"([a-zA-Z0-9_]+)=THEME\.([a-zA-Z0-9_]+)")

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = pattern.sub(r"\1={THEME.\2}", content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Fixed braces in {os.path.basename(filepath)}")

